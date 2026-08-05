import "server-only";

import { Client } from "@upstash/qstash";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { financeReconciliationDelaysSeconds, loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

type RecoveryPurpose = "PAYOUT_RECONCILIATION" | "FUNDING_RECONCILIATION" | "RECOVERY_EXECUTION";

function utcUsageDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function reserveQStashBudget(
  purpose: RecoveryPurpose,
  critical: boolean
): Promise<{ allowed: boolean; used: number }> {
  const env = loadServerEnv();
  return db.$transaction(
    async (tx) => {
      const usageDate = utcUsageDate();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`qstash:${usageDate.toISOString()}`}))`;
      const total = await tx.qStashUsageDaily.aggregate({
        where: { usageDate },
        _sum: { publishedCount: true }
      });
      const used = total._sum.publishedCount ?? 0;
      const limit = critical ? env.QSTASH_DAILY_HARD_LIMIT : env.QSTASH_DAILY_SOFT_LIMIT;
      const allowed = used < limit;
      await tx.qStashUsageDaily.upsert({
        where: { usageDate_purpose: { usageDate, purpose } },
        create: {
          usageDate,
          purpose,
          ...(allowed ? { publishedCount: 1 } : { rejectedCount: 1 })
        },
        update: allowed ? { publishedCount: { increment: 1 } } : { rejectedCount: { increment: 1 } }
      });
      return { allowed, used: used + (allowed ? 1 : 0) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function schedulePayoutReconciliation(input: {
  payoutId: string;
  expectedAttemptId: string;
  sequence: number;
}): Promise<{ scheduled: boolean; reason?: string }> {
  const env = loadServerEnv();
  const delays = financeReconciliationDelaysSeconds(env);
  const delay = delays[input.sequence - 1];
  if (!delay) {
    await db.tenantPayout.update({
      where: { id: input.payoutId },
      data: { requiresManualReview: true, reviewReason: "RECONCILIATION_EXHAUSTED" }
    });
    await db.tenantPayoutExecutionIntent.updateMany({
      where: { tenantPayoutId: input.payoutId },
      data: { dispatchStatus: "EXHAUSTED" }
    });
    return { scheduled: false, reason: "RECONCILIATION_EXHAUSTED" };
  }
  const payout = await db.tenantPayout.findUnique({
    where: { id: input.payoutId },
    include: { tenant: true, executionIntent: true }
  });
  if (!payout?.executionIntent) {
    throw new AppError("PAYOUT_STATE", "Payout recovery thiếu execution intent.", 409);
  }
  const [qstashFlag, reconciliationFlag] = await Promise.all([
    db.featureFlag.findUnique({ where: { key: "qstash.recovery.enabled" } }),
    db.featureFlag.findUnique({ where: { key: "tenant.auto_reconciliation.enabled" } })
  ]);
  const globalEnabled = Boolean(qstashFlag?.enabled && reconciliationFlag?.enabled);
  if (
    !globalEnabled ||
    !payout.tenant.autoReconciliationEnabled ||
    !env.QSTASH_TOKEN ||
    !env.APP_BASE_URL?.startsWith("https://")
  ) {
    await db.tenantPayout.update({
      where: { id: payout.id },
      data: { requiresManualReview: true, reviewReason: "QSTASH_RECOVERY_DISABLED" }
    });
    await db.tenantPayoutExecutionIntent.update({
      where: { id: payout.executionIntent.id },
      data: { dispatchStatus: "FAILED", lastDispatchError: "QSTASH_RECOVERY_DISABLED" }
    });
    return { scheduled: false, reason: "QSTASH_RECOVERY_DISABLED" };
  }
  const budget = await reserveQStashBudget("PAYOUT_RECONCILIATION", true);
  if (!budget.allowed) {
    await db.tenantPayout.update({
      where: { id: payout.id },
      data: { requiresManualReview: true, reviewReason: "QSTASH_DAILY_HARD_LIMIT" }
    });
    await db.tenantPayoutExecutionIntent.update({
      where: { id: payout.executionIntent.id },
      data: { dispatchStatus: "EXHAUSTED", lastDispatchError: "QSTASH_DAILY_HARD_LIMIT" }
    });
    return { scheduled: false, reason: "QSTASH_DAILY_HARD_LIMIT" };
  }

  const qstash = new Client({ token: env.QSTASH_TOKEN });
  try {
    await qstash.publishJSON({
      url: new URL("/api/internal/jobs/payout-reconcile", env.APP_BASE_URL).toString(),
      body: input,
      delay,
      retries: 0,
      deduplicationId: `payout-reconcile:${input.payoutId}:${input.expectedAttemptId}:${input.sequence}`,
      label: "finance-payout-reconcile"
    });
    await db.tenantPayoutExecutionIntent.update({
      where: { id: payout.executionIntent.id },
      data: { dispatchStatus: "PUBLISHED", lastDispatchError: null }
    });
    return { scheduled: true };
  } catch (error) {
    await db.tenantPayoutExecutionIntent.update({
      where: { id: payout.executionIntent.id },
      data: {
        dispatchStatus: "FAILED",
        lastDispatchError:
          error instanceof Error ? error.message.slice(0, 300) : "QSTASH_PUBLISH_FAILED"
      }
    });
    return { scheduled: false, reason: "QSTASH_PUBLISH_FAILED" };
  }
}

export async function scheduleFundingReconciliation(input: {
  fundingOrderId: string;
  sequence: number;
}): Promise<{ scheduled: boolean; reason?: string }> {
  const env = loadServerEnv();
  const delay = financeReconciliationDelaysSeconds(env)[input.sequence - 1];
  const order = await db.tenantFundingOrder.findUnique({
    where: { id: input.fundingOrderId },
    include: { tenant: true }
  });
  if (!order) throw new AppError("NOT_FOUND", "Funding order không tồn tại.", 404);
  if (!delay) {
    await db.tenantFundingOrder.update({
      where: { id: order.id },
      data: { requiresManualReview: true, reviewReason: "RECONCILIATION_EXHAUSTED" }
    });
    return { scheduled: false, reason: "RECONCILIATION_EXHAUSTED" };
  }
  const [qstashFlag, reconciliationFlag] = await Promise.all([
    db.featureFlag.findUnique({ where: { key: "qstash.recovery.enabled" } }),
    db.featureFlag.findUnique({ where: { key: "tenant.auto_reconciliation.enabled" } })
  ]);
  if (
    !qstashFlag?.enabled ||
    !reconciliationFlag?.enabled ||
    !order.tenant.autoReconciliationEnabled ||
    !env.QSTASH_TOKEN ||
    !env.APP_BASE_URL.startsWith("https://")
  ) {
    await db.tenantFundingOrder.update({
      where: { id: order.id },
      data: { requiresManualReview: true, reviewReason: "QSTASH_RECOVERY_DISABLED" }
    });
    return { scheduled: false, reason: "QSTASH_RECOVERY_DISABLED" };
  }
  if (!(await reserveQStashBudget("FUNDING_RECONCILIATION", true)).allowed) {
    await db.tenantFundingOrder.update({
      where: { id: order.id },
      data: { requiresManualReview: true, reviewReason: "QSTASH_DAILY_HARD_LIMIT" }
    });
    return { scheduled: false, reason: "QSTASH_DAILY_HARD_LIMIT" };
  }
  try {
    await new Client({ token: env.QSTASH_TOKEN }).publishJSON({
      url: new URL("/api/internal/jobs/funding-reconcile", env.APP_BASE_URL).toString(),
      body: input,
      delay,
      retries: 0,
      deduplicationId: `funding-reconcile:${order.id}:${input.sequence}`,
      label: "finance-funding-reconcile"
    });
    return { scheduled: true };
  } catch {
    await db.tenantFundingOrder.update({
      where: { id: order.id },
      data: { requiresManualReview: true, reviewReason: "QSTASH_PUBLISH_FAILED" }
    });
    return { scheduled: false, reason: "QSTASH_PUBLISH_FAILED" };
  }
}

import { db } from "@/lib/db";
import { financeReconciliationDelaysSeconds, loadServerEnv } from "@/lib/env";
import { AppError, errorResponse } from "@/lib/errors";
import { requestId } from "@/lib/request";
import { schedulePayoutReconciliation } from "@/modules/tenants/recovery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const reqId = await requestId();
  try {
    const env = loadServerEnv();
    if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
      throw new AppError("AUTH_REQUIRED", "Yêu cầu ủy quyền Cron hợp lệ.", 401);
    }
    const state = await db.financeSafetySweepState.upsert({
      where: { id: "finance" },
      create: { id: "finance" },
      update: {}
    });
    const now = Date.now();
    const approvedCutoff = new Date(now - env.FINANCE_APPROVED_STALE_MINUTES * 60_000);
    const processingCutoff = new Date(now - env.FINANCE_PROCESSING_STALE_MINUTES * 60_000);
    const unknownCutoff = new Date(now - env.FINANCE_UNKNOWN_SLA_MINUTES * 60_000);
    const cursorWhere =
      state.cursorCreatedAt && state.cursorId
        ? {
            OR: [
              { createdAt: { gt: state.cursorCreatedAt } },
              { createdAt: state.cursorCreatedAt, id: { gt: state.cursorId } }
            ]
          }
        : {};
    const payouts = await db.tenantPayout.findMany({
      where: {
        AND: [
          cursorWhere,
          {
            OR: [
              {
                approvalStatus: "APPROVED",
                settlementStatus: "NOT_STARTED",
                createdAt: { lt: approvedCutoff }
              },
              {
                approvalStatus: "APPROVED",
                settlementStatus: "PROCESSING",
                submittedAt: { lt: processingCutoff }
              },
              {
                settlementStatus: "UNKNOWN",
                updatedAt: { lt: unknownCutoff }
              },
              { settlementStatus: { in: ["PAID", "FAILED"] }, terminalJournalId: null }
            ]
          }
        ]
      },
      include: {
        executionIntent: true,
        attempts: { orderBy: [{ sequence: "desc" }, { createdAt: "desc" }] }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: env.FINANCE_SWEEP_BATCH_SIZE
    });

    let scheduled = 0;
    let flagged = 0;
    const delayCount = financeReconciliationDelaysSeconds(env).length;
    for (const payout of payouts) {
      if (payout.settlementStatus === "PAID" || payout.settlementStatus === "FAILED") {
        await db.tenantPayout.update({
          where: { id: payout.id },
          data: { requiresManualReview: true, reviewReason: "TERMINAL_JOURNAL_MISSING" }
        });
        flagged += 1;
        continue;
      }
      if (payout.settlementStatus === "NOT_STARTED") {
        await db.tenantPayout.update({
          where: { id: payout.id },
          data: { requiresManualReview: true, reviewReason: "APPROVED_EXECUTION_NOT_STARTED" }
        });
        flagged += 1;
        continue;
      }
      const submitAttempt = payout.attempts.find((attempt) => attempt.operation === "SUBMIT");
      const reconcileAttempts = payout.attempts.filter(
        (attempt) => attempt.operation === "RECONCILE"
      );
      const nextSequence = reconcileAttempts.length + 1;
      if (submitAttempt && nextSequence <= delayCount) {
        const result = await schedulePayoutReconciliation({
          payoutId: payout.id,
          expectedAttemptId: submitAttempt.id,
          sequence: nextSequence
        });
        if (result.scheduled) scheduled += 1;
        else flagged += 1;
      } else {
        await db.tenantPayout.update({
          where: { id: payout.id },
          data: { requiresManualReview: true, reviewReason: "RECONCILIATION_EXHAUSTED" }
        });
        flagged += 1;
      }
    }

    const last = payouts.at(-1) ?? null;
    await db.financeSafetySweepState.update({
      where: { id: "finance" },
      data: {
        cursorCreatedAt:
          payouts.length === env.FINANCE_SWEEP_BATCH_SIZE && last ? last.createdAt : null,
        cursorId: payouts.length === env.FINANCE_SWEEP_BATCH_SIZE && last ? last.id : null,
        lastRunAt: new Date()
      }
    });
    await db.auditLog.create({
      data: {
        actorRole: "SYSTEM_WORKER",
        source: "VERCEL_CRON",
        action: "finance.safety_sweep_completed",
        entityType: "System",
        entityId: "daily-sweep",
        requestId: reqId,
        after: { scanned: payouts.length, scheduled, flagged }
      }
    });
    return Response.json(
      { data: { scanned: payouts.length, scheduled, flagged } },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": reqId } }
    );
  } catch (error) {
    return errorResponse(error, reqId);
  }
}

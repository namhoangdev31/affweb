import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { PayOS, type Payout } from "@payos/node";
import {
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  PayoutApprovalStatus,
  PayoutMethod,
  PayoutSettlementStatus,
  Prisma,
  TenantPayoutAttemptOperation,
  TenantPayoutAttemptStatus,
  TenantPayoutIntentExecutionStatus,
  TenantObligationStatus,
  TenantPayoutKind,
  TenantPayoutType
} from "@/generated/prisma/client";
import { decryptSensitiveValue } from "@/lib/crypto";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  BETA_MAX_PAYOUT_VND,
  DEFAULT_SYSTEM_DAILY_PAYOUT_BUDGET_VND,
  MIN_PAYOUT_VND,
  startOfVietnamDay
} from "@/lib/money";
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";
import { postJournal } from "@/modules/ledger/service";
import { assertPayoutProviderEnabled } from "@/modules/payout/provider-gate";
import { assertTenantFinanceGate, settleTenantRecovery } from "@/modules/tenants/finance";
import {
  type FinancialActorContext,
  revalidateFinancialActorContext
} from "@/modules/tenants/persona";
import {
  canApprovePayout,
  canCancelPayout,
  canRequestMemberWithdrawal,
  canRequestReconciliation,
  canRequestTreasuryWithdrawal
} from "@/modules/tenants/payout-policy";
import { schedulePayoutReconciliation } from "@/modules/tenants/recovery";
import {
  canTransitionPayoutApproval,
  canTransitionPayoutSettlement,
  deriveLegacyTenantPayoutStatus
} from "@/modules/tenants/payout-state";

const DAILY_TENANT_PAYOUT_LIMIT_VND = 500_000n;

function payoutRequestHash(input: {
  tenantId: string;
  userId: string;
  beneficiaryId: string;
  amountVnd: bigint;
  kind: TenantPayoutKind;
}): string {
  return createHash("sha256")
    .update(
      [
        input.tenantId,
        input.userId,
        input.beneficiaryId,
        input.amountVnd.toString(),
        input.kind
      ].join("\n")
    )
    .digest("hex");
}

function systemExecutionContext(
  source: FinancialActorContext,
  workerIdentity: string
): FinancialActorContext {
  return {
    actorUserId: null,
    actorRole: "SYSTEM_WORKER",
    workerIdentity,
    targetTenantId: source.targetTenantId,
    targetUserId: source.targetUserId,
    source: source.source,
    requestId: source.requestId,
    ipHash: source.ipHash,
    userAgent: source.userAgent
  };
}

function auditContext(context: FinancialActorContext) {
  return {
    actorUserId: context.actorUserId,
    actorRole: context.actorRole,
    targetTenantId: context.targetTenantId,
    targetUserId: context.targetUserId ?? null,
    source: context.source,
    requestId: context.requestId,
    ipHash: context.ipHash ?? null,
    userAgent: context.userAgent ?? null
  };
}

function systemDailyBudget(value: Prisma.JsonValue | null | undefined): bigint {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("amountVnd" in value)) {
    return DEFAULT_SYSTEM_DAILY_PAYOUT_BUDGET_VND;
  }
  try {
    const budget = BigInt(String(value.amountVnd));
    return budget > 0n ? budget : DEFAULT_SYSTEM_DAILY_PAYOUT_BUDGET_VND;
  } catch {
    return DEFAULT_SYSTEM_DAILY_PAYOUT_BUDGET_VND;
  }
}

async function withSerializable<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034");
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new AppError(
    "INTERNAL_ERROR",
    "Không thể thực hiện giao dịch tài chính tenant payout.",
    503
  );
}

function tenantPayOSClient(operation: "submit" | "reconcile" = "submit"): PayOS {
  const env = loadServerEnv();
  const config = {
    enabled: true,
    databaseEnabled: true,
    clientId: env.PAYOS_CLIENT_ID,
    apiKey: env.PAYOS_API_KEY,
    checksumKey: env.PAYOS_CHECKSUM_KEY
  };
  assertPayoutProviderEnabled(config);
  return new PayOS({
    clientId: config.clientId,
    apiKey: config.apiKey,
    checksumKey: config.checksumKey,
    timeout: 20_000,
    maxRetries: 0
  });
}

function mapPayOSState(payout: Payout): PayoutSettlementStatus {
  const states = payout.transactions.map((transaction) => transaction.state);
  if (
    ["COMPLETED", "PARTIAL_COMPLETED"].includes(payout.approvalState) &&
    states.length > 0 &&
    states.every((state) => state === "SUCCEEDED")
  ) {
    return "PAID";
  }
  if (
    ["FAILED", "REJECTED", "CANCELLED"].includes(payout.approvalState) ||
    (states.length > 0 &&
      states.every((state) => ["FAILED", "REVERSED", "CANCELLED"].includes(state)))
  ) {
    return "FAILED";
  }
  return ["PROCESSING", "APPROVED", "SCHEDULED", "PARTIAL_COMPLETED"].includes(
    payout.approvalState
  ) || states.some((state) => ["PROCESSING", "ON_HOLD"].includes(state))
    ? "PROCESSING"
    : "NOT_STARTED";
}

async function reserveMemberObligations(
  tx: Prisma.TransactionClient,
  tenantPayoutId: string,
  tenantId: string,
  userId: string,
  amountVnd: bigint
): Promise<void> {
  let remaining = amountVnd;
  await tx.$queryRaw`
    SELECT id FROM "TenantCashbackObligation"
    WHERE "tenantId" = ${tenantId} AND "userId" = ${userId} AND status = 'AVAILABLE'
    ORDER BY "createdAt" ASC, id ASC
    FOR UPDATE
  `;
  const obligations = await tx.tenantCashbackObligation.findMany({
    where: {
      tenantId,
      userId,
      status: TenantObligationStatus.AVAILABLE,
      fundedVnd: { gt: 0n }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  for (const obligation of obligations) {
    if (remaining === 0n) break;
    const available = obligation.fundedVnd - obligation.reservedVnd - obligation.paidVnd;
    if (available <= 0n) continue;
    const allocated = available < remaining ? available : remaining;
    await tx.tenantPayoutAllocation.create({
      data: { tenantPayoutId, obligationId: obligation.id, amountVnd: allocated }
    });
    await tx.tenantCashbackObligation.update({
      where: { id: obligation.id },
      data: {
        reservedVnd: { increment: allocated },
        status: TenantObligationStatus.RESERVED,
        reservedAt: new Date()
      }
    });
    remaining -= allocated;
  }
  if (remaining !== 0n) {
    throw new AppError("INTERNAL_ERROR", "Ví tenant không khớp nghĩa vụ đã cấp vốn.", 500);
  }
}

async function settlePayoutAllocations(
  tx: Prisma.TransactionClient,
  tenantPayoutId: string,
  paid: boolean,
  recoveredVnd = 0n
): Promise<void> {
  let remainingRecovery = recoveredVnd;
  const allocations = await tx.tenantPayoutAllocation.findMany({
    where: { tenantPayoutId },
    include: { obligation: true },
    orderBy: { createdAt: "asc" }
  });
  for (const allocation of allocations) {
    const obligation = allocation.obligation;
    const recovered = paid
      ? 0n
      : remainingRecovery < allocation.amountVnd
        ? remainingRecovery
        : allocation.amountVnd;
    remainingRecovery -= recovered;
    const nextReserved = obligation.reservedVnd - allocation.amountVnd;
    const nextFunded = obligation.fundedVnd - recovered;
    const nextRecovered = obligation.recoveredVnd + recovered;
    const nextPaid = obligation.paidVnd + (paid ? allocation.amountVnd : 0n);
    const pending = obligation.amountVnd - nextFunded - nextRecovered;
    const nextStatus =
      obligation.recoveryRequiredVnd > 0n
        ? TenantObligationStatus.RECOVERY_REQUIRED
        : nextReserved > 0n
          ? TenantObligationStatus.RESERVED
          : paid && nextPaid >= nextFunded
            ? TenantObligationStatus.PAID
            : pending > 0n
              ? TenantObligationStatus.PENDING_FUNDING
              : nextFunded > nextPaid
                ? TenantObligationStatus.AVAILABLE
                : TenantObligationStatus.CANCELLED;
    await tx.tenantCashbackObligation.update({
      where: { id: obligation.id },
      data: {
        reservedVnd: { decrement: allocation.amountVnd },
        ...(paid ? { paidVnd: { increment: allocation.amountVnd } } : {}),
        ...(recovered > 0n
          ? {
              fundedVnd: { decrement: recovered },
              recoveredVnd: { increment: recovered }
            }
          : {}),
        status: nextStatus,
        ...(paid ? { paidAt: new Date() } : {}),
        ...(nextReserved === 0n ? { reservedAt: null } : {})
      }
    });
  }
  if (remainingRecovery !== 0n) {
    throw new AppError("INTERNAL_ERROR", "Payout allocation không đủ để thu hồi recovery.", 500);
  }
}

async function applyTerminalOutcome(
  tx: Prisma.TransactionClient,
  payout: {
    id: string;
    tenantId: string;
    userId: string;
    kind: TenantPayoutKind;
    amountVnd: bigint;
    approvalStatus: PayoutApprovalStatus;
    settlementStatus: PayoutSettlementStatus;
  },
  nextSettlement: PayoutSettlementStatus
): Promise<string | null> {
  if (nextSettlement !== "PAID" && nextSettlement !== "FAILED") return null;
  const isMember = payout.kind === TenantPayoutKind.MEMBER_WITHDRAWAL;
  const sourceCode = isMember
    ? `liability:tenant:${payout.tenantId}:user:${payout.userId}:available`
    : `liability:tenant:${payout.tenantId}:treasury`;
  const sourceName = isMember ? "Tenant member available cashback" : "Tenant treasury liability";
  const reservedCode = `liability:tenant:${payout.tenantId}:payout:${payout.id}:reserved`;

  if (nextSettlement === "PAID") {
    const journal = await postJournal(tx, {
      type: LedgerTransactionType.TENANT_PAYOUT_PAID,
      idempotencyKey: `tenant-payout:${payout.id}:paid`,
      description: "Hoàn tất payout tenant.",
      reference: payout.id,
      lines: [
        {
          accountCode: reservedCode,
          accountName: "Tenant payout reserved",
          accountKind: LedgerAccountKind.LIABILITY,
          direction: LedgerDirection.DEBIT,
          amountVnd: payout.amountVnd
        },
        {
          accountCode: `asset:tenant-funding:${payout.tenantId}:cash`,
          accountName: "Tenant funding cash",
          accountKind: LedgerAccountKind.ASSET,
          direction: LedgerDirection.CREDIT,
          amountVnd: payout.amountVnd
        }
      ]
    });
    if (!journal.created) return journal.id;
    if (isMember) {
      await settlePayoutAllocations(tx, payout.id, true);
      await tx.tenantMemberWalletProjection.update({
        where: { tenantId_userId: { tenantId: payout.tenantId, userId: payout.userId } },
        data: {
          reservedVnd: { decrement: payout.amountVnd },
          paidVnd: { increment: payout.amountVnd },
          version: { increment: 1 }
        }
      });
    } else {
      await tx.tenantTreasuryProjection.update({
        where: { tenantId: payout.tenantId },
        data: {
          reservedVnd: { decrement: payout.amountVnd },
          withdrawnVnd: { increment: payout.amountVnd },
          version: { increment: 1 }
        }
      });
    }
    return journal.id;
  } else {
    let recoveredVnd = 0n;
    if (isMember) {
      await tx.$queryRaw`
        SELECT id FROM "TenantTreasuryProjection"
        WHERE "tenantId" = ${payout.tenantId}
        FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT id FROM "TenantMemberWalletProjection"
        WHERE "tenantId" = ${payout.tenantId} AND "userId" = ${payout.userId}
        FOR UPDATE
      `;
      const wallet = await tx.tenantMemberWalletProjection.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId: payout.tenantId, userId: payout.userId } }
      });
      recoveredVnd = wallet.recoveryVnd < payout.amountVnd ? wallet.recoveryVnd : payout.amountVnd;
    }
    const availableVnd = payout.amountVnd - recoveredVnd;
    const journal = await postJournal(tx, {
      type: LedgerTransactionType.TENANT_PAYOUT_RELEASE,
      idempotencyKey: `tenant-payout:${payout.id}:release`,
      description: "Hoàn lại số dư do payout tenant thất bại.",
      reference: payout.id,
      lines: [
        {
          accountCode: reservedCode,
          accountName: "Tenant payout reserved",
          accountKind: LedgerAccountKind.LIABILITY,
          direction: LedgerDirection.DEBIT,
          amountVnd: payout.amountVnd
        },
        ...(availableVnd > 0n
          ? [
              {
                accountCode: sourceCode,
                accountName: sourceName,
                accountKind: LedgerAccountKind.LIABILITY,
                ...(isMember ? { userId: payout.userId } : {}),
                direction: LedgerDirection.CREDIT,
                amountVnd: availableVnd
              }
            ]
          : []),
        ...(recoveredVnd > 0n
          ? [
              {
                accountCode: `asset:tenant:${payout.tenantId}:user:${payout.userId}:recovery`,
                accountName: "Tenant member recovery receivable",
                accountKind: LedgerAccountKind.ASSET,
                userId: payout.userId,
                direction: LedgerDirection.CREDIT,
                amountVnd: recoveredVnd
              }
            ]
          : [])
      ]
    });
    if (!journal.created) return journal.id;
    if (isMember) {
      if (recoveredVnd > 0n) {
        await settleTenantRecovery(tx, payout.tenantId, payout.userId, recoveredVnd);
      }
      await settlePayoutAllocations(tx, payout.id, false, recoveredVnd);
      await tx.tenantMemberWalletProjection.update({
        where: { tenantId_userId: { tenantId: payout.tenantId, userId: payout.userId } },
        data: {
          reservedVnd: { decrement: payout.amountVnd },
          availableVnd: { increment: availableVnd },
          recoveryVnd: { decrement: recoveredVnd },
          version: { increment: 1 }
        }
      });
      if (recoveredVnd > 0n) {
        await tx.tenantTreasuryProjection.update({
          where: { tenantId: payout.tenantId },
          data: { availableVnd: { increment: recoveredVnd }, version: { increment: 1 } }
        });
      }
    } else {
      await tx.tenantTreasuryProjection.update({
        where: { tenantId: payout.tenantId },
        data: {
          reservedVnd: { decrement: payout.amountVnd },
          availableVnd: { increment: payout.amountVnd },
          version: { increment: 1 }
        }
      });
    }
    return journal.id;
  }
}

async function reserveTenantPayout(input: {
  actorContext: FinancialActorContext;
  tenantId: string;
  userId: string;
  beneficiaryId: string;
  kind: TenantPayoutKind;
  amountVnd: bigint;
  idempotencyKey: string;
  requestHash: string;
}) {
  if (input.amountVnd < MIN_PAYOUT_VND || input.amountVnd > BETA_MAX_PAYOUT_VND) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Payout phải từ ${MIN_PAYOUT_VND} đến ${BETA_MAX_PAYOUT_VND} VND.`,
      400
    );
  }
  return withSerializable(async (tx) => {
    const existing = await tx.tenantPayout.findUnique({
      where: {
        tenantId_userId_clientIdempotencyKey: {
          tenantId: input.tenantId,
          userId: input.userId,
          clientIdempotencyKey: input.idempotencyKey
        }
      }
    });
    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        throw new AppError("CONFLICT", "Idempotency-Key đã được dùng với dữ liệu khác.", 409);
      }
      return existing;
    }
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
    await assertTenantFinanceGate(tenant, "payout_request", tx);
    if (input.kind === TenantPayoutKind.TREASURY_WITHDRAWAL) {
      await assertTenantFinanceGate(tenant, "treasury_withdrawal", tx);
    }

    const beneficiary = await tx.bankBeneficiary.findFirst({
      where: {
        id: input.beneficiaryId,
        userId: input.userId,
        active: true,
        status: "VERIFIED"
      },
      include: { changes: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (!beneficiary) {
      throw new AppError("VALIDATION_ERROR", "Tài khoản nhận tiền không hợp lệ.", 400);
    }
    if (!beneficiary.changes[0] || beneficiary.changes[0].holdUntil > new Date()) {
      throw new AppError(
        "BENEFICIARY_HOLD",
        "Tài khoản nhận tiền đang trong thời gian bảo vệ sau thay đổi.",
        409
      );
    }

    const spent = await tx.tenantPayout.aggregate({
      where: {
        tenantId: input.tenantId,
        userId: input.userId,
        createdAt: { gte: startOfVietnamDay() },
        approvalStatus: { notIn: ["REJECTED", "CANCELLED"] },
        settlementStatus: { not: "FAILED" }
      },
      _sum: { amountVnd: true }
    });
    const systemTenantSpent = await tx.tenantPayout.aggregate({
      where: {
        createdAt: { gte: startOfVietnamDay() },
        approvalStatus: { notIn: ["REJECTED", "CANCELLED"] },
        settlementStatus: { not: "FAILED" }
      },
      _sum: { amountVnd: true }
    });
    const systemCoreSpent = await tx.payoutTicket.aggregate({
      where: {
        createdAt: { gte: startOfVietnamDay() },
        status: { notIn: ["FAILED", "CANCELLED"] }
      },
      _sum: { amountVnd: true }
    });
    const budgetFlag = await tx.featureFlag.findUnique({
      where: { key: "payout.daily_budget_vnd" },
      select: { value: true }
    });
    if ((spent._sum.amountVnd ?? 0n) + input.amountVnd > DAILY_TENANT_PAYOUT_LIMIT_VND) {
      throw new AppError("PAYOUT_LIMIT", "Đã vượt hạn mức payout tenant trong ngày.", 409);
    }
    if (
      (systemTenantSpent._sum.amountVnd ?? 0n) +
        (systemCoreSpent._sum.amountVnd ?? 0n) +
        input.amountVnd >
      systemDailyBudget(budgetFlag?.value)
    ) {
      throw new AppError("PAYOUT_LIMIT", "Ngân sách payout toàn hệ thống hôm nay đã hết.", 409);
    }

    if (input.kind === TenantPayoutKind.MEMBER_WITHDRAWAL) {
      await tx.$queryRaw`
          SELECT id FROM "TenantMemberWalletProjection"
          WHERE "tenantId" = ${input.tenantId} AND "userId" = ${input.userId}
          FOR UPDATE
        `;
      const wallet = await tx.tenantMemberWalletProjection.findUnique({
        where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } }
      });
      if (!wallet || wallet.availableVnd < input.amountVnd) {
        throw new AppError("INSUFFICIENT_BALANCE", "Ví tenant không đủ số dư khả dụng.", 409);
      }
    } else {
      await tx.$queryRaw`SELECT id FROM "TenantTreasuryProjection" WHERE "tenantId" = ${input.tenantId} FOR UPDATE`;
      const treasury = await tx.tenantTreasuryProjection.findUnique({
        where: { tenantId: input.tenantId }
      });
      if (!treasury || treasury.availableVnd < input.amountVnd) {
        throw new AppError("INSUFFICIENT_BALANCE", "Treasury không đủ số dư chưa cam kết.", 409);
      }
    }

    const legacyStatus = deriveLegacyTenantPayoutStatus("PENDING", "NOT_STARTED");
    const payoutType: TenantPayoutType =
      input.kind === TenantPayoutKind.MEMBER_WITHDRAWAL
        ? TenantPayoutType.MEMBER_WITHDRAWAL
        : TenantPayoutType.TENANT_TREASURY_WITHDRAWAL;

    const payout = await tx.tenantPayout.create({
      data: {
        reference: `TPO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        tenantId: input.tenantId,
        userId: input.userId,
        requestedByUserId: input.userId,
        beneficiaryId: beneficiary.id,
        kind: input.kind,
        type: payoutType,
        approvalStatus: PayoutApprovalStatus.PENDING,
        settlementStatus: PayoutSettlementStatus.NOT_STARTED,
        method: null,
        status: legacyStatus,
        amountVnd: input.amountVnd,
        clientIdempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        bankBinSnapshot: beneficiary.bankBin,
        accountLast4Snapshot: beneficiary.accountLast4,
        accountNumberCipherSnapshot: beneficiary.accountNumberCipher,
        accountNameCipherSnapshot: beneficiary.accountNameCipher
      }
    });

    if (input.kind === TenantPayoutKind.MEMBER_WITHDRAWAL) {
      await reserveMemberObligations(tx, payout.id, input.tenantId, input.userId, input.amountVnd);
    }
    const sourceCode =
      input.kind === TenantPayoutKind.MEMBER_WITHDRAWAL
        ? `liability:tenant:${input.tenantId}:user:${input.userId}:available`
        : `liability:tenant:${input.tenantId}:treasury`;

    const journal = await postJournal(tx, {
      type: LedgerTransactionType.TENANT_PAYOUT_RESERVE,
      idempotencyKey: `tenant-payout:${payout.id}:reserve`,
      description: "Khóa số dư cho payout tenant.",
      reference: payout.id,
      createdById: input.userId,
      lines: [
        {
          accountCode: sourceCode,
          accountName:
            input.kind === TenantPayoutKind.MEMBER_WITHDRAWAL
              ? "Tenant member available cashback"
              : "Tenant treasury liability",
          accountKind: LedgerAccountKind.LIABILITY,
          ...(input.kind === TenantPayoutKind.MEMBER_WITHDRAWAL ? { userId: input.userId } : {}),
          direction: LedgerDirection.DEBIT,
          amountVnd: input.amountVnd
        },
        {
          accountCode: `liability:tenant:${input.tenantId}:payout:${payout.id}:reserved`,
          accountName: "Tenant payout reserved",
          accountKind: LedgerAccountKind.LIABILITY,
          direction: LedgerDirection.CREDIT,
          amountVnd: input.amountVnd
        }
      ]
    });

    await tx.tenantPayout.update({
      where: { id: payout.id },
      data: { reservationJournalId: journal.id }
    });

    await tx.auditLog.create({
      data: {
        ...auditContext(input.actorContext),
        action: "tenant.payout.requested",
        entityType: "TenantPayout",
        entityId: payout.id,
        after: {
          type: payoutType,
          amountVnd: input.amountVnd.toString(),
          reservationJournalId: journal.id
        }
      }
    });

    if (input.kind === TenantPayoutKind.MEMBER_WITHDRAWAL) {
      await tx.tenantMemberWalletProjection.update({
        where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
        data: {
          availableVnd: { decrement: input.amountVnd },
          reservedVnd: { increment: input.amountVnd },
          version: { increment: 1 }
        }
      });
    } else {
      await tx.tenantTreasuryProjection.update({
        where: { tenantId: input.tenantId },
        data: {
          availableVnd: { decrement: input.amountVnd },
          reservedVnd: { increment: input.amountVnd },
          version: { increment: 1 }
        }
      });
    }
    return payout;
  });
}

export async function requestMemberWithdrawal(
  actorContext: FinancialActorContext,
  amountVnd: bigint,
  idempotencyKey: string,
  beneficiaryId: string
) {
  const actor = await revalidateFinancialActorContext(actorContext);
  if (
    !actor.actorUserId ||
    !canRequestMemberWithdrawal({
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      targetTenantId: actor.targetTenantId,
      targetUserId: actor.actorUserId
    })
  ) {
    throw new AppError("AUTH_REQUIRED", "Yêu cầu đăng nhập để rút tiền.", 401);
  }
  const requestHash = payoutRequestHash({
    tenantId: actor.targetTenantId,
    userId: actor.actorUserId,
    beneficiaryId,
    amountVnd,
    kind: TenantPayoutKind.MEMBER_WITHDRAWAL
  });
  return reserveTenantPayout({
    actorContext: actor,
    tenantId: actor.targetTenantId,
    userId: actor.actorUserId,
    beneficiaryId,
    kind: TenantPayoutKind.MEMBER_WITHDRAWAL,
    amountVnd,
    idempotencyKey,
    requestHash
  });
}

export async function requestTreasuryWithdrawal(
  actorContext: FinancialActorContext,
  amountVnd: bigint,
  idempotencyKey: string,
  beneficiaryId: string
) {
  const actor = await revalidateFinancialActorContext(actorContext);
  if (!actor.actorUserId || !canRequestTreasuryWithdrawal(actor.actorRole)) {
    throw new AppError("AUTH_REQUIRED", "Yêu cầu đăng nhập để rút tiền treasury.", 401);
  }
  await requireRecentFinancePasskey(actor.actorUserId);
  const requestHash = payoutRequestHash({
    tenantId: actor.targetTenantId,
    userId: actor.actorUserId,
    beneficiaryId,
    amountVnd,
    kind: TenantPayoutKind.TREASURY_WITHDRAWAL
  });
  return reserveTenantPayout({
    actorContext: actor,
    tenantId: actor.targetTenantId,
    userId: actor.actorUserId,
    beneficiaryId,
    kind: TenantPayoutKind.TREASURY_WITHDRAWAL,
    amountVnd,
    idempotencyKey,
    requestHash
  });
}

export async function approvePayout(
  actorContext: FinancialActorContext,
  payoutId: string,
  method: PayoutMethod,
  note?: string
) {
  const actor = await revalidateFinancialActorContext(actorContext);
  if (!actor.actorUserId) {
    throw new AppError("AUTH_REQUIRED", "Yêu cầu tài khoản xác thực.", 401);
  }
  await requireRecentFinancePasskey(actor.actorUserId);
  const env = loadServerEnv();
  const approved = await withSerializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TenantPayout" WHERE id = ${payoutId} FOR UPDATE`;
    const payout = await tx.tenantPayout.findUnique({
      where: { id: payoutId },
      include: { tenant: true }
    });
    if (!payout) throw new AppError("NOT_FOUND", "Payout ticket không tồn tại.", 404);
    if (payout.legacyResolutionStatus !== "NOT_REQUIRED") {
      throw new AppError(
        "PAYOUT_STATE",
        "Legacy payout chỉ được xử lý qua workflow resolveLegacyPayout.",
        409
      );
    }
    if (
      !canApprovePayout({
        actorRole: actor.actorRole,
        actorTargetTenantId: actor.targetTenantId,
        payout
      })
    ) {
      throw new AppError("FORBIDDEN", "Không có quyền duyệt payout này.", 403);
    }
    if (!canTransitionPayoutApproval(payout.approvalStatus, PayoutApprovalStatus.APPROVED)) {
      throw new AppError("PAYOUT_STATE", "Payout không còn ở trạng thái chờ duyệt.", 409);
    }
    await assertTenantFinanceGate(payout.tenant, "payout_approval", tx);
    if (method === PayoutMethod.MANUAL_BANK_TRANSFER) {
      await assertTenantFinanceGate(payout.tenant, "manual_payout", tx);
    }

    const platformPayout = payout.tenant.kind === "MASTER";
    const selfApproval = platformPayout && payout.requestedByUserId === actor.actorUserId;
    let heldForReview = false;
    if (selfApproval) {
      if (!note?.trim()) {
        throw new AppError("VALIDATION_ERROR", "Self-approval bắt buộc có lý do.", 400);
      }
      const activeOwnerCount = await tx.user.count({
        where: {
          status: "ACTIVE",
          OR: [
            ...(payout.tenant.ownerUserId ? [{ id: payout.tenant.ownerUserId }] : []),
            { roles: { some: { role: "SUPER_ADMIN" } } }
          ]
        }
      });
      if (activeOwnerCount > 1) {
        throw new AppError(
          "FORBIDDEN",
          "Platform payout phải được một Owner khác người yêu cầu duyệt.",
          403
        );
      }
      heldForReview = payout.amountVnd > env.PLATFORM_SELF_APPROVAL_LIMIT_VND;
    }

    const updated = await tx.tenantPayout.update({
      where: { id: payout.id },
      data: {
        approvalStatus: PayoutApprovalStatus.APPROVED,
        method,
        approvedByUserId: actor.actorUserId,
        approvedAt: new Date(),
        approvalNote: note?.trim() || null,
        isPlatformSelfApproved: selfApproval,
        platformSelfApprovalReason: selfApproval ? note!.trim() : null,
        requiresManualReview: heldForReview,
        reviewReason: heldForReview ? "PLATFORM_SELF_APPROVAL_LIMIT_EXCEEDED" : null,
        status: deriveLegacyTenantPayoutStatus("APPROVED", payout.settlementStatus)
      }
    });

    if (method === PayoutMethod.PAYOS && !heldForReview) {
      await tx.tenantPayoutExecutionIntent.create({
        data: {
          tenantPayoutId: payout.id,
          providerReference: payout.reference,
          providerIdempotencyKey: `tenant-payout:${payout.id}:submit`,
          requestFingerprint: payout.requestHash
        }
      });
    }
    await tx.auditLog.create({
      data: {
        ...auditContext(actor),
        action: selfApproval
          ? heldForReview
            ? "PLATFORM_PAYOUT_SELF_APPROVAL_HELD"
            : "PLATFORM_PAYOUT_SELF_APPROVED"
          : "tenant.payout.approved",
        entityType: "TenantPayout",
        entityId: payout.id,
        reason: note?.trim() || null,
        before: {
          approvalStatus: payout.approvalStatus,
          settlementStatus: payout.settlementStatus
        },
        after: {
          approvalStatus: "APPROVED",
          settlementStatus: payout.settlementStatus,
          method,
          heldForReview,
          amountVnd: payout.amountVnd.toString()
        }
      }
    });
    return { payout: updated, heldForReview };
  });

  if (approved.heldForReview || method === PayoutMethod.MANUAL_BANK_TRANSFER) {
    return {
      approvalStatus: approved.payout.approvalStatus,
      settlementStatus: approved.payout.settlementStatus,
      executionResult: approved.heldForReview ? "HELD_FOR_MANUAL_REVIEW" : "MANUAL_NOT_STARTED"
    };
  }

  const systemContext = systemExecutionContext(actor, "internal-inline-executor");
  await executeApprovedPayosPayout(systemContext, approved.payout.id).catch(() => undefined);
  const updated = await db.tenantPayout.findUniqueOrThrow({ where: { id: approved.payout.id } });
  return {
    approvalStatus: updated.approvalStatus,
    settlementStatus: updated.settlementStatus,
    executionResult:
      updated.settlementStatus === "PAID" || updated.settlementStatus === "FAILED"
        ? updated.settlementStatus
        : "PENDING_CONFIRMATION"
  };
}

export async function rejectPayout(
  actorContext: FinancialActorContext,
  payoutId: string,
  reason: string
) {
  const actor = await revalidateFinancialActorContext(actorContext);
  if (!actor.actorUserId) {
    throw new AppError("AUTH_REQUIRED", "Yêu cầu tài khoản xác thực.", 401);
  }
  await requireRecentFinancePasskey(actor.actorUserId);
  if (!reason.trim()) {
    throw new AppError("VALIDATION_ERROR", "Từ chối payout bắt buộc có lý do.", 400);
  }

  return withSerializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TenantPayout" WHERE id = ${payoutId} FOR UPDATE`;
    const current = await tx.tenantPayout.findUnique({
      where: { id: payoutId },
      include: { tenant: true }
    });
    if (!current) throw new AppError("NOT_FOUND", "Payout ticket không tồn tại.", 404);
    if (
      current.legacyResolutionStatus !== "NOT_REQUIRED" ||
      !canApprovePayout({
        actorRole: actor.actorRole,
        actorTargetTenantId: actor.targetTenantId,
        payout: current
      })
    ) {
      throw new AppError("FORBIDDEN", "Không có quyền từ chối payout này.", 403);
    }
    if (current.approvalStatus !== PayoutApprovalStatus.PENDING) {
      throw new AppError("PAYOUT_STATE", "Payout ticket đã được xử lý trước đó.", 409);
    }
    await assertTenantFinanceGate(current.tenant, "payout_approval", tx);
    const terminalJournalId = await applyTerminalOutcome(
      tx,
      { ...current, approvalStatus: PayoutApprovalStatus.REJECTED },
      PayoutSettlementStatus.FAILED
    );
    const updated = await tx.tenantPayout.update({
      where: { id: current.id },
      data: {
        approvalStatus: PayoutApprovalStatus.REJECTED,
        rejectedByUserId: actorContext.actorUserId,
        rejectedAt: new Date(),
        rejectionReason: reason.trim(),
        terminalJournalId,
        status: deriveLegacyTenantPayoutStatus(
          PayoutApprovalStatus.REJECTED,
          current.settlementStatus
        )
      }
    });
    await tx.auditLog.create({
      data: {
        ...auditContext(actor),
        action: "tenant.payout.rejected",
        entityType: "TenantPayout",
        entityId: current.id,
        reason: reason.trim(),
        before: { approvalStatus: current.approvalStatus },
        after: { approvalStatus: "REJECTED", terminalJournalId }
      }
    });
    return updated;
  });
}

export async function cancelPayout(
  actorContext: FinancialActorContext,
  payoutId: string,
  reason: string
) {
  const actor = await revalidateFinancialActorContext(actorContext);
  if (!actor.actorUserId) {
    throw new AppError("AUTH_REQUIRED", "Yêu cầu tài khoản xác thực.", 401);
  }
  if (!reason.trim()) {
    throw new AppError("VALIDATION_ERROR", "Hủy payout bắt buộc có lý do.", 400);
  }

  return withSerializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TenantPayout" WHERE id = ${payoutId} FOR UPDATE`;
    const current = await tx.tenantPayout.findUnique({ where: { id: payoutId } });
    if (!current) throw new AppError("NOT_FOUND", "Payout ticket không tồn tại.", 404);
    if (
      current.legacyResolutionStatus !== "NOT_REQUIRED" ||
      !canCancelPayout({
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        actorTargetTenantId: actor.targetTenantId,
        payout: current
      })
    ) {
      throw new AppError("FORBIDDEN", "Không có quyền hủy payout này.", 403);
    }
    if (current.approvalStatus !== PayoutApprovalStatus.PENDING) {
      throw new AppError("PAYOUT_STATE", "Payout ticket đã được xử lý trước đó.", 409);
    }
    const terminalJournalId = await applyTerminalOutcome(
      tx,
      { ...current, approvalStatus: PayoutApprovalStatus.CANCELLED },
      PayoutSettlementStatus.FAILED
    );

    const updated = await tx.tenantPayout.update({
      where: { id: current.id },
      data: {
        approvalStatus: PayoutApprovalStatus.CANCELLED,
        cancelledByUserId: actorContext.actorUserId,
        cancelledAt: new Date(),
        cancellationReason: reason.trim(),
        terminalJournalId,
        status: deriveLegacyTenantPayoutStatus(
          PayoutApprovalStatus.CANCELLED,
          current.settlementStatus
        )
      }
    });
    await tx.auditLog.create({
      data: {
        ...auditContext(actor),
        action: "tenant.payout.cancelled",
        entityType: "TenantPayout",
        entityId: current.id,
        reason: reason.trim(),
        before: { approvalStatus: current.approvalStatus },
        after: { approvalStatus: "CANCELLED", terminalJournalId }
      }
    });
    return updated;
  });
}

export async function finalizeTenantPayoutSettlement(
  systemContext: FinancialActorContext,
  payoutId: string,
  nextSettlement: PayoutSettlementStatus,
  evidence: {
    attemptId?: string;
    providerPayoutId?: string;
    providerState?: string;
    failureCode?: string;
    failureMessage?: string;
    manualCompletedByUserId?: string;
    manualTransferReference?: string;
    manualEvidenceReference?: string;
    manualResolutionType?: "CONFIRMED_PAID" | "CONFIRMED_NOT_SENT" | "REMAIN_UNKNOWN";
  } = {}
) {
  const system = await revalidateFinancialActorContext(systemContext);
  if (system.actorRole !== "SYSTEM_WORKER") {
    throw new AppError("FORBIDDEN", "Settlement chỉ được thực hiện bởi internal service.", 403);
  }
  return withSerializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TenantPayout" WHERE id = ${payoutId} FOR UPDATE`;
    const current = await tx.tenantPayout.findUnique({
      where: { id: payoutId },
      include: { executionIntent: true }
    });
    if (!current) throw new AppError("NOT_FOUND", "Tenant payout không tồn tại.", 404);
    if (current.tenantId !== system.targetTenantId) {
      throw new AppError("FORBIDDEN", "Internal settlement tenant scope không khớp.", 403);
    }
    if (current.settlementStatus === "PAID" || current.settlementStatus === "FAILED") {
      return current;
    }
    if (!canTransitionPayoutSettlement(current.settlementStatus, nextSettlement)) {
      throw new AppError(
        "PAYOUT_STATE",
        `Không thể chuyển settlement ${current.settlementStatus} → ${nextSettlement}.`,
        409
      );
    }
    const terminalJournalId = await applyTerminalOutcome(tx, current, nextSettlement);
    if (evidence.attemptId) {
      await tx.tenantPayoutAttempt.update({
        where: { id: evidence.attemptId },
        data: {
          ...(evidence.providerPayoutId ? { providerPayoutId: evidence.providerPayoutId } : {}),
          ...(evidence.providerState
            ? {
                providerState: evidence.providerState,
                providerResponseStatus: evidence.providerState
              }
            : {}),
          status:
            nextSettlement === "PAID" || nextSettlement === "PROCESSING"
              ? TenantPayoutAttemptStatus.SUCCEEDED
              : nextSettlement === "FAILED"
                ? TenantPayoutAttemptStatus.FAILED
                : TenantPayoutAttemptStatus.UNKNOWN,
          ...(evidence.failureCode ? { errorClassification: evidence.failureCode } : {}),
          completedAt: new Date(),
          reconciledAt: new Date()
        }
      });
    }
    if (current.executionIntent) {
      await tx.tenantPayoutExecutionIntent.update({
        where: { id: current.executionIntent.id },
        data: {
          executionStatus:
            nextSettlement === "PAID"
              ? TenantPayoutIntentExecutionStatus.CONFIRMED
              : nextSettlement === "FAILED"
                ? TenantPayoutIntentExecutionStatus.FAILED
                : nextSettlement === "UNKNOWN"
                  ? TenantPayoutIntentExecutionStatus.UNKNOWN
                  : TenantPayoutIntentExecutionStatus.REQUESTED,
          ...(nextSettlement === "PAID" || nextSettlement === "FAILED"
            ? { completedAt: new Date() }
            : {})
        }
      });
    }
    const updated = await tx.tenantPayout.update({
      where: { id: current.id },
      data: {
        settlementStatus: nextSettlement,
        terminalJournalId: terminalJournalId ?? current.terminalJournalId,
        paidAt: nextSettlement === "PAID" ? new Date() : current.paidAt,
        failureCode: evidence.failureCode ?? null,
        failureMessage: evidence.failureMessage?.slice(0, 500) ?? null,
        ...(evidence.manualCompletedByUserId
          ? {
              manualCompletedByUserId: evidence.manualCompletedByUserId,
              manualCompletedAt: nextSettlement === "PAID" ? new Date() : current.manualCompletedAt,
              manualResolvedByUserId: evidence.manualCompletedByUserId,
              manualResolvedAt: new Date()
            }
          : {}),
        ...(evidence.manualTransferReference
          ? { manualTransferReference: evidence.manualTransferReference }
          : {}),
        ...(evidence.manualEvidenceReference
          ? { manualEvidenceReference: evidence.manualEvidenceReference }
          : {}),
        ...(evidence.manualResolutionType
          ? { manualResolutionType: evidence.manualResolutionType }
          : {}),
        status: deriveLegacyTenantPayoutStatus(current.approvalStatus, nextSettlement)
      }
    });
    await tx.auditLog.create({
      data: {
        ...auditContext(system),
        action: "tenant.payout.settlement_observed",
        entityType: "TenantPayout",
        entityId: current.id,
        before: { settlementStatus: current.settlementStatus },
        after: {
          settlementStatus: nextSettlement,
          providerPayoutId: evidence.providerPayoutId ?? null,
          manualResolutionType: evidence.manualResolutionType ?? null,
          terminalJournalId
        }
      }
    });
    return updated;
  });
}

export async function executeApprovedPayosPayout(
  systemContext: FinancialActorContext,
  payoutId: string
) {
  const system = await revalidateFinancialActorContext(systemContext);
  if (
    system.actorRole !== "SYSTEM_WORKER" ||
    system.workerIdentity !== "internal-inline-executor"
  ) {
    throw new AppError("FORBIDDEN", "PayOS submit chỉ dành cho internal inline executor.", 403);
  }

  const claim = await withSerializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TenantPayout" WHERE id = ${payoutId} FOR UPDATE`;
    const ticket = await tx.tenantPayout.findUnique({
      where: { id: payoutId },
      include: { tenant: true, executionIntent: true }
    });
    if (!ticket) throw new AppError("NOT_FOUND", "Tenant payout không tồn tại.", 404);
    if (ticket.tenantId !== system.targetTenantId) {
      throw new AppError("FORBIDDEN", "Internal execution tenant scope không khớp.", 403);
    }
    if (
      ticket.approvalStatus !== PayoutApprovalStatus.APPROVED ||
      ticket.method !== PayoutMethod.PAYOS ||
      !ticket.reservationJournalId
    ) {
      throw new AppError("PAYOUT_STATE", "Payout chưa đủ điều kiện PayOS execution.", 409);
    }
    if (ticket.requiresManualReview) {
      throw new AppError("PAYOUT_STATE", "Payout đang chờ manual review.", 409);
    }
    if (ticket.settlementStatus === "PAID" || ticket.settlementStatus === "FAILED") {
      return { shouldSubmit: false as const, ticket, attemptId: null };
    }
    const intent = ticket.executionIntent;
    if (!intent) throw new AppError("PAYOUT_STATE", "Execution intent chưa được tạo.", 409);
    if (intent.executionStatus !== TenantPayoutIntentExecutionStatus.READY) {
      return { shouldSubmit: false as const, ticket, attemptId: null };
    }
    await assertTenantFinanceGate(ticket.tenant, "payout", tx);
    const now = new Date();
    const attempt = await tx.tenantPayoutAttempt.create({
      data: {
        tenantPayoutId: ticket.id,
        intentId: intent.id,
        attemptNumber: 1,
        operation: TenantPayoutAttemptOperation.SUBMIT,
        status: TenantPayoutAttemptStatus.REQUESTED,
        sequence: 1,
        idempotencyKey: intent.providerIdempotencyKey,
        requestFingerprint: intent.requestFingerprint,
        workerIdentity: system.workerIdentity ?? null,
        submittedAt: now
      }
    });
    await tx.tenantPayoutExecutionIntent.update({
      where: { id: intent.id },
      data: {
        executionStatus: TenantPayoutIntentExecutionStatus.REQUESTED,
        claimedAt: now,
        submittedAt: now
      }
    });
    const processing = await tx.tenantPayout.update({
      where: { id: ticket.id },
      data: {
        settlementStatus: PayoutSettlementStatus.PROCESSING,
        submittedAt: now,
        status: deriveLegacyTenantPayoutStatus(
          ticket.approvalStatus,
          PayoutSettlementStatus.PROCESSING
        )
      }
    });
    await tx.auditLog.create({
      data: {
        ...auditContext(system),
        action: "tenant.payout.payos_submission_created",
        entityType: "TenantPayout",
        entityId: ticket.id,
        after: { intentId: intent.id, attemptId: attempt.id }
      }
    });
    return { shouldSubmit: true as const, ticket: processing, attemptId: attempt.id };
  });

  if (!claim.shouldSubmit || !claim.attemptId) return claim.ticket;
  const ticket = await db.tenantPayout.findUniqueOrThrow({ where: { id: payoutId } });
  const client = tenantPayOSClient("submit");
  const destination = decryptSensitiveValue(ticket.accountNumberCipherSnapshot);
  try {
    const provider = await client.payouts.batch.create(
      {
        referenceId: ticket.reference,
        validateDestination: true,
        category: ["AFFILIATE_CASHBACK"],
        payouts: [
          {
            referenceId: ticket.reference,
            amount: Number(ticket.amountVnd),
            description: `Tenant cashback ${ticket.reference}`.slice(0, 100),
            toBin: ticket.bankBinSnapshot,
            toAccountNumber: destination
          }
        ]
      },
      `tenant-payout:${ticket.id}:submit`
    );
    const mapped = mapPayOSState(provider);
    const nextSettlement = mapped === "NOT_STARTED" ? PayoutSettlementStatus.UNKNOWN : mapped;
    const result = await finalizeTenantPayoutSettlement(system, ticket.id, nextSettlement, {
      attemptId: claim.attemptId,
      providerPayoutId: provider.id,
      providerState: provider.approvalState
    });
    if (result.settlementStatus === "PROCESSING" || result.settlementStatus === "UNKNOWN") {
      await schedulePayoutReconciliation({
        payoutId: ticket.id,
        expectedAttemptId: claim.attemptId,
        sequence: 1
      }).catch(() => undefined);
    }
    return result;
  } catch (error) {
    const result = await finalizeTenantPayoutSettlement(
      system,
      ticket.id,
      PayoutSettlementStatus.UNKNOWN,
      {
        attemptId: claim.attemptId,
        failureCode: "PAYOS_UNCERTAIN",
        failureMessage: error instanceof Error ? error.message : "Unknown PayOS error"
      }
    );
    await schedulePayoutReconciliation({
      payoutId: ticket.id,
      expectedAttemptId: claim.attemptId,
      sequence: 1
    }).catch(() => undefined);
    return result;
  }
}

export async function reconcileTenantPayout(
  systemContext: FinancialActorContext,
  payoutId: string,
  sequence = 1
) {
  const system = await revalidateFinancialActorContext(systemContext);
  if (system.actorRole !== "SYSTEM_WORKER") {
    throw new AppError("FORBIDDEN", "Provider query chỉ dành cho internal service.", 403);
  }
  const prepared = await withSerializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TenantPayout" WHERE id = ${payoutId} FOR UPDATE`;
    const ticket = await tx.tenantPayout.findUnique({
      where: { id: payoutId },
      include: { tenant: true, executionIntent: true }
    });
    if (!ticket?.executionIntent || ticket.tenantId !== system.targetTenantId) {
      throw new AppError("PAYOUT_STATE", "Không có execution intent hợp lệ để đối soát.", 409);
    }
    if (ticket.settlementStatus === "PAID" || ticket.settlementStatus === "FAILED") {
      return { terminal: true as const, ticket, attempt: null };
    }
    await assertTenantFinanceGate(ticket.tenant, "reconciliation", tx);
    const attempt = await tx.tenantPayoutAttempt.upsert({
      where: {
        intentId_operation_sequence: {
          intentId: ticket.executionIntent.id,
          operation: TenantPayoutAttemptOperation.RECONCILE,
          sequence
        }
      },
      create: {
        tenantPayoutId: ticket.id,
        intentId: ticket.executionIntent.id,
        attemptNumber: sequence + 1,
        operation: TenantPayoutAttemptOperation.RECONCILE,
        status: TenantPayoutAttemptStatus.REQUESTED,
        sequence,
        idempotencyKey: `tenant-payout:${ticket.id}:reconcile:${sequence}`,
        requestFingerprint: ticket.executionIntent.requestFingerprint,
        workerIdentity: system.workerIdentity ?? null,
        submittedAt: new Date()
      },
      update: {}
    });
    return { terminal: false as const, ticket, attempt };
  });
  if (prepared.terminal || !prepared.attempt) return prepared.ticket;

  const client = tenantPayOSClient("reconcile");
  const submitAttempt = await db.tenantPayoutAttempt.findFirst({
    where: {
      tenantPayoutId: payoutId,
      operation: TenantPayoutAttemptOperation.SUBMIT
    }
  });
  let provider: Payout | undefined;
  if (submitAttempt?.providerPayoutId) {
    provider = await client.payouts.get(submitAttempt.providerPayoutId);
  } else {
    const page = await client.payouts.list({ referenceId: prepared.ticket.reference, limit: 10 });
    provider = page.data.find((candidate) => candidate.referenceId === prepared.ticket.reference);
  }
  if (!provider) {
    return finalizeTenantPayoutSettlement(system, payoutId, PayoutSettlementStatus.UNKNOWN, {
      attemptId: prepared.attempt.id,
      failureCode: "PAYOS_NOT_FOUND",
      failureMessage: "PayOS chưa trả về payout theo immutable provider reference."
    });
  }
  const mapped = mapPayOSState(provider);
  const nextSettlement = mapped === "NOT_STARTED" ? PayoutSettlementStatus.UNKNOWN : mapped;
  return finalizeTenantPayoutSettlement(system, payoutId, nextSettlement, {
    attemptId: prepared.attempt.id,
    providerPayoutId: provider.id,
    providerState: provider.approvalState
  });
}

export async function requestPayoutReconciliation(
  actorContext: FinancialActorContext,
  payoutId: string,
  sequence = 1
) {
  const actor = await revalidateFinancialActorContext(actorContext);
  const payout = await db.tenantPayout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new AppError("NOT_FOUND", "Tenant payout không tồn tại.", 404);
  if (
    !canRequestReconciliation({
      actorRole: actor.actorRole,
      actorTargetTenantId: actor.targetTenantId,
      payoutTenantId: payout.tenantId
    })
  ) {
    throw new AppError("FORBIDDEN", "Không có quyền yêu cầu đối soát payout này.", 403);
  }
  if (actor.actorUserId) await requireRecentFinancePasskey(actor.actorUserId);
  return reconcileTenantPayout(
    systemExecutionContext(actor, "internal-reconciliation-service"),
    payoutId,
    sequence
  );
}

export async function resumePayoutExecution(actorContext: FinancialActorContext, payoutId: string) {
  const actor = await revalidateFinancialActorContext(actorContext);
  const payout = await db.tenantPayout.findUnique({
    where: { id: payoutId },
    include: { executionIntent: true }
  });
  if (!payout) throw new AppError("NOT_FOUND", "Tenant payout không tồn tại.", 404);
  if (
    !canRequestReconciliation({
      actorRole: actor.actorRole,
      actorTargetTenantId: actor.targetTenantId,
      payoutTenantId: payout.tenantId
    })
  ) {
    throw new AppError("FORBIDDEN", "Không có quyền resume payout này.", 403);
  }
  if (payout.executionIntent?.executionStatus === TenantPayoutIntentExecutionStatus.READY) {
    return executeApprovedPayosPayout(
      systemExecutionContext(actor, "internal-inline-executor"),
      payout.id
    );
  }
  return requestPayoutReconciliation(actor, payout.id);
}

export type LegacyPayoutDecision =
  "CONFIRMED_PAID" | "CONFIRMED_FAILED" | "CONFIRMED_NOT_SUBMITTED" | "REMAIN_UNKNOWN";

export async function resolveLegacyPayout(
  actorContext: FinancialActorContext,
  input: {
    payoutId: string;
    decision: LegacyPayoutDecision;
    evidenceReference: string;
    providerReference?: string;
    reason: string;
  }
) {
  const actor = await revalidateFinancialActorContext(actorContext);
  if (actor.actorRole !== "OWNER" || !actor.actorUserId) {
    throw new AppError("FORBIDDEN", "Chỉ Owner được resolve legacy payout.", 403);
  }
  await requireRecentFinancePasskey(actor.actorUserId);
  if (!input.reason.trim() || !input.evidenceReference.trim()) {
    throw new AppError("VALIDATION_ERROR", "Legacy resolution cần reason và evidence.", 400);
  }
  return withSerializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TenantPayout" WHERE id = ${input.payoutId} FOR UPDATE`;
    const payout = await tx.tenantPayout.findUnique({ where: { id: input.payoutId } });
    if (!payout) throw new AppError("NOT_FOUND", "Legacy payout không tồn tại.", 404);
    if (payout.tenantId !== actor.targetTenantId) {
      throw new AppError("FORBIDDEN", "Legacy payout không thuộc target tenant.", 403);
    }
    if (
      payout.legacyResolutionStatus === "NOT_REQUIRED" ||
      payout.legacyResolutionStatus === "RESOLVED"
    ) {
      throw new AppError("PAYOUT_STATE", "Payout không còn chờ legacy resolution.", 409);
    }

    let approvalStatus: PayoutApprovalStatus = payout.approvalStatus;
    let settlementStatus: PayoutSettlementStatus = payout.settlementStatus;
    let terminalJournalId = payout.terminalJournalId;
    if (input.decision === "CONFIRMED_PAID" || input.decision === "CONFIRMED_FAILED") {
      approvalStatus = PayoutApprovalStatus.APPROVED;
      settlementStatus =
        input.decision === "CONFIRMED_PAID"
          ? PayoutSettlementStatus.PAID
          : PayoutSettlementStatus.FAILED;
      terminalJournalId = await applyTerminalOutcome(
        tx,
        { ...payout, approvalStatus },
        settlementStatus
      );
    } else if (input.decision === "CONFIRMED_NOT_SUBMITTED") {
      approvalStatus = PayoutApprovalStatus.CANCELLED;
      terminalJournalId = await applyTerminalOutcome(
        tx,
        { ...payout, approvalStatus },
        PayoutSettlementStatus.FAILED
      );
      settlementStatus = PayoutSettlementStatus.NOT_STARTED;
    } else {
      approvalStatus = PayoutApprovalStatus.PENDING;
      settlementStatus = PayoutSettlementStatus.UNKNOWN;
    }

    if (input.providerReference && !payout.legacySourceId) {
      throw new AppError("PAYOUT_STATE", "Legacy provenance chưa được lưu.", 409);
    }
    if (input.providerReference) {
      await tx.tenantPayoutExecutionIntent.upsert({
        where: { tenantPayoutId: payout.id },
        create: {
          tenantPayoutId: payout.id,
          providerReference: input.providerReference,
          providerIdempotencyKey: `legacy:${payout.legacySourceType}:${payout.legacySourceId}`,
          requestFingerprint: payout.requestHash,
          executionStatus:
            settlementStatus === "PAID"
              ? "CONFIRMED"
              : settlementStatus === "FAILED"
                ? "FAILED"
                : "UNKNOWN",
          completedAt:
            settlementStatus === "PAID" || settlementStatus === "FAILED" ? new Date() : null
        },
        update: {}
      });
    }
    const resolved = await tx.tenantPayout.update({
      where: { id: payout.id },
      data: {
        approvalStatus,
        settlementStatus,
        terminalJournalId,
        paidAt: settlementStatus === "PAID" ? new Date() : payout.paidAt,
        cancelledByUserId:
          approvalStatus === "CANCELLED" ? actor.actorUserId : payout.cancelledByUserId,
        cancelledAt: approvalStatus === "CANCELLED" ? new Date() : payout.cancelledAt,
        cancellationReason:
          approvalStatus === "CANCELLED" ? input.reason.trim() : payout.cancellationReason,
        legacyResolutionStatus: input.decision === "REMAIN_UNKNOWN" ? "MANUAL_REVIEW" : "RESOLVED",
        requiresManualReview: input.decision === "REMAIN_UNKNOWN",
        reviewReason: input.decision === "REMAIN_UNKNOWN" ? input.reason.trim() : null,
        status: deriveLegacyTenantPayoutStatus(approvalStatus, settlementStatus)
      }
    });
    await tx.auditLog.create({
      data: {
        ...auditContext(actor),
        action: "tenant.payout.legacy_resolved",
        entityType: "TenantPayout",
        entityId: payout.id,
        reason: input.reason.trim(),
        before: {
          approvalStatus: payout.approvalStatus,
          settlementStatus: payout.settlementStatus,
          legacyResolutionStatus: payout.legacyResolutionStatus
        },
        after: {
          decision: input.decision,
          approvalStatus,
          settlementStatus,
          evidenceReference: input.evidenceReference.trim(),
          providerReference: input.providerReference ?? null,
          terminalJournalId
        }
      }
    });
    return resolved;
  });
}

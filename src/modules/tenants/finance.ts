import "server-only";

import {
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  Prisma,
  TenantFundingOrderStatus,
  TenantObligationStatus,
  type Tenant
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { createTenantFundingPaymentLink } from "@/lib/payos";
import { scheduleFundingReconciliation } from "@/modules/tenants/recovery";
import { postJournal } from "@/modules/ledger/service";
import { tenantFinanceGateReady } from "@/modules/tenants/finance-policy";
import { requireTenantMasterContext } from "@/modules/tenants/persona";

type Tx = Prisma.TransactionClient;
type FinanceOperation =
  | "finance"
  | "topup"
  | "payout"
  | "payout_request"
  | "payout_approval"
  | "treasury_withdrawal"
  | "manual_payout"
  | "reconciliation";

const MIN_TENANT_FUNDING_VND = 100_000n;
const MAX_TENANT_FUNDING_VND = 50_000_000n;

export async function assertTenantFinanceGate(
  tenant: Pick<
    Tenant,
    | "financeEnabled"
    | "topupEnabled"
    | "autoPayoutEnabled"
    | "payoutRequestEnabled"
    | "payoutApprovalEnabled"
    | "treasuryWithdrawalEnabled"
    | "manualPayoutEnabled"
    | "autoReconciliationEnabled"
  >,
  operation: FinanceOperation,
  tx?: Tx
): Promise<void> {
  const env = loadServerEnv();
  const client = tx ?? db;
  const operationKey: string | null =
    {
      finance: null,
      topup: "tenant.topup.enabled",
      payout: "tenant.auto_payout.enabled",
      payout_request: "tenant.payout_request.enabled",
      payout_approval: "tenant.payout_approval.enabled",
      treasury_withdrawal: "tenant.treasury_withdrawal.enabled",
      manual_payout: "tenant.manual_payout.enabled",
      reconciliation: "tenant.auto_reconciliation.enabled"
    }[operation] ?? null;
  const tenantOperation =
    operation === "topup"
      ? tenant.topupEnabled
      : operation === "payout"
        ? tenant.autoPayoutEnabled
        : operation === "payout_request"
          ? tenant.payoutRequestEnabled
          : operation === "payout_approval"
            ? tenant.payoutApprovalEnabled
            : operation === "treasury_withdrawal"
              ? tenant.treasuryWithdrawalEnabled
              : operation === "manual_payout"
                ? tenant.manualPayoutEnabled
                : operation === "reconciliation"
                  ? tenant.autoReconciliationEnabled
                  : true;
  const envFinance = env.TENANT_FINANCE_ENABLED;
  const envOperation =
    operation === "topup"
      ? env.TENANT_TOPUP_ENABLED
      : operation === "payout"
        ? env.TENANT_AUTO_PAYOUT_ENABLED
        : true;

  const globalFinanceFlag = await client.featureFlag.findUnique({
    where: { key: "tenant.finance.enabled" },
    select: { enabled: true }
  });
  const globalOperationFlag = operationKey
    ? await client.featureFlag.findUnique({
        where: { key: operationKey },
        select: { enabled: true }
      })
    : null;

  const ready = tenantFinanceGateReady({
    envFinance,
    envOperation,
    globalFinance: globalFinanceFlag?.enabled ?? true,
    globalOperation: globalOperationFlag?.enabled ?? true,
    tenantFinance: tenant.financeEnabled,
    tenantOperation
  });
  if (!ready) {
    const label =
      operation === "topup" ? "Nạp quỹ" : operation === "payout" ? "Payout" : "Tài chính";
    throw new AppError("CONNECTOR_DISABLED", `${label} tenant đang tạm dừng.`, 503);
  }
}

async function withSerializable<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" ||
          error.code === "P2002" ||
          String(error.message).includes("40001") ||
          String(error.message).includes("deadlock"));
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new AppError("INTERNAL_ERROR", "Không thể hoàn tất transaction tenant.", 503);
}

async function ensureTreasury(tx: Tx, tenantId: string): Promise<void> {
  await tx.tenantTreasuryProjection.upsert({
    where: { tenantId },
    create: { tenantId },
    update: {}
  });
}

async function ensureMemberWallet(tx: Tx, tenantId: string, userId: string): Promise<void> {
  await tx.tenantMemberWalletProjection.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    create: { tenantId, userId },
    update: {}
  });
}

export async function settleTenantRecovery(
  tx: Tx,
  tenantId: string,
  userId: string,
  amountVnd: bigint
): Promise<void> {
  let remaining = amountVnd;
  const recoveries = await tx.tenantCashbackObligation.findMany({
    where: { tenantId, userId, recoveryRequiredVnd: { gt: 0n } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  for (const obligation of recoveries) {
    if (remaining === 0n) break;
    const applied =
      remaining < obligation.recoveryRequiredVnd ? remaining : obligation.recoveryRequiredVnd;
    const nextRecovery = obligation.recoveryRequiredVnd - applied;
    const pending = obligation.amountVnd - obligation.fundedVnd - obligation.recoveredVnd;
    await tx.tenantCashbackObligation.update({
      where: { id: obligation.id },
      data: {
        recoveryRequiredVnd: { decrement: applied },
        status:
          nextRecovery > 0n
            ? TenantObligationStatus.RECOVERY_REQUIRED
            : obligation.amountVnd === 0n
              ? TenantObligationStatus.CANCELLED
              : obligation.reservedVnd > 0n
                ? TenantObligationStatus.RESERVED
                : obligation.paidVnd >= obligation.fundedVnd && obligation.fundedVnd > 0n
                  ? TenantObligationStatus.PAID
                  : pending > 0n
                    ? TenantObligationStatus.PENDING_FUNDING
                    : obligation.fundedVnd > 0n
                      ? TenantObligationStatus.AVAILABLE
                      : TenantObligationStatus.CANCELLED
      }
    });
    remaining -= applied;
  }
  if (remaining !== 0n) {
    throw new AppError("INTERNAL_ERROR", "Tenant recovery projection không khớp nghĩa vụ.", 500);
  }
}

async function consumeOtherAvailableCashback(
  tx: Tx,
  tenantId: string,
  userId: string,
  excludedObligationId: string,
  amountVnd: bigint
): Promise<void> {
  let remaining = amountVnd;
  const obligations = await tx.tenantCashbackObligation.findMany({
    where: {
      tenantId,
      userId,
      id: { not: excludedObligationId },
      fundedVnd: { gt: 0n }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  for (const obligation of obligations) {
    if (remaining === 0n) break;
    const available = obligation.fundedVnd - obligation.reservedVnd - obligation.paidVnd;
    if (available <= 0n) continue;
    const consumed = available < remaining ? available : remaining;
    const nextFunded = obligation.fundedVnd - consumed;
    const nextRecovered = obligation.recoveredVnd + consumed;
    const pending = obligation.amountVnd - nextFunded - nextRecovered;
    await tx.tenantCashbackObligation.update({
      where: { id: obligation.id },
      data: {
        fundedVnd: { decrement: consumed },
        recoveredVnd: { increment: consumed },
        status:
          obligation.recoveryRequiredVnd > 0n
            ? TenantObligationStatus.RECOVERY_REQUIRED
            : obligation.reservedVnd > 0n
              ? TenantObligationStatus.RESERVED
              : obligation.paidVnd >= nextFunded && nextFunded > 0n
                ? TenantObligationStatus.PAID
                : pending > 0n
                  ? TenantObligationStatus.PENDING_FUNDING
                  : nextFunded > obligation.paidVnd
                    ? TenantObligationStatus.AVAILABLE
                    : TenantObligationStatus.CANCELLED
      }
    });
    remaining -= consumed;
  }
  if (remaining !== 0n) {
    throw new AppError("INTERNAL_ERROR", "Ví tenant không khớp nghĩa vụ cashback khả dụng.", 500);
  }
}

export async function allocatePendingTenantCashback(
  tx: Tx,
  tenantId: string
): Promise<{ funded: number; fundedVnd: bigint }> {
  await ensureTreasury(tx, tenantId);
  await tx.$queryRaw`SELECT id FROM "TenantTreasuryProjection" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
  let treasury = await tx.tenantTreasuryProjection.findUniqueOrThrow({ where: { tenantId } });
  const obligations = await tx.tenantCashbackObligation.findMany({
    where: { tenantId, status: TenantObligationStatus.PENDING_FUNDING },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  let funded = 0;
  let fundedVnd = 0n;

  for (const obligation of obligations) {
    await ensureMemberWallet(tx, tenantId, obligation.userId);
    await tx.$queryRaw`
      SELECT id FROM "TenantMemberWalletProjection"
      WHERE "tenantId" = ${tenantId} AND "userId" = ${obligation.userId}
      FOR UPDATE
    `;
    const wallet = await tx.tenantMemberWalletProjection.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId, userId: obligation.userId } }
    });
    const unfunded = obligation.amountVnd - obligation.fundedVnd - obligation.recoveredVnd;
    if (unfunded <= 0n) continue;
    const recovered = wallet.recoveryVnd < unfunded ? wallet.recoveryVnd : unfunded;
    if (recovered > 0n) {
      const journal = await postJournal(tx, {
        type: LedgerTransactionType.TENANT_RECOVERY,
        idempotencyKey: `tenant-obligation:${obligation.id}:recovery-offset:${obligation.recoveredVnd.toString()}:${recovered.toString()}`,
        description: "Khấu trừ cashback tương lai để thu hồi tenant recovery.",
        reference: obligation.conversionId,
        metadata: { tenantId, userId: obligation.userId },
        lines: [
          {
            accountCode: `liability:tenant:${tenantId}:treasury`,
            accountName: "Tenant treasury liability",
            accountKind: LedgerAccountKind.LIABILITY,
            direction: LedgerDirection.DEBIT,
            amountVnd: recovered
          },
          {
            accountCode: `asset:tenant:${tenantId}:user:${obligation.userId}:recovery`,
            accountName: "Tenant member recovery receivable",
            accountKind: LedgerAccountKind.ASSET,
            userId: obligation.userId,
            direction: LedgerDirection.CREDIT,
            amountVnd: recovered
          }
        ]
      });
      if (!journal.created) {
        throw new AppError("CONFLICT", "Recovery offset đã được ghi nhận trước đó.", 409);
      }
      await settleTenantRecovery(tx, tenantId, obligation.userId, recovered);
      await tx.tenantMemberWalletProjection.update({
        where: { tenantId_userId: { tenantId, userId: obligation.userId } },
        data: {
          pendingFundingVnd: { decrement: recovered },
          recoveryVnd: { decrement: recovered },
          version: { increment: 1 }
        }
      });
      await tx.tenantCashbackObligation.update({
        where: { id: obligation.id },
        data: { recoveredVnd: { increment: recovered } }
      });
    }
    const payable = unfunded - recovered;
    if (payable === 0n) {
      await tx.tenantCashbackObligation.update({
        where: { id: obligation.id },
        data: { status: TenantObligationStatus.CANCELLED, cancelledAt: new Date() }
      });
      continue;
    }
    if (treasury.availableVnd < payable) break;

    const journal = await postJournal(tx, {
      type: LedgerTransactionType.TENANT_WALLET_ALLOCATION,
      idempotencyKey: `tenant-obligation:${obligation.id}:fund:${obligation.fundedVnd.toString()}`,
      description: "Cấp vốn cashback từ treasury tenant cho member.",
      reference: obligation.conversionId,
      metadata: { tenantId, userId: obligation.userId },
      lines: [
        {
          accountCode: `liability:tenant:${tenantId}:treasury`,
          accountName: "Tenant treasury liability",
          accountKind: LedgerAccountKind.LIABILITY,
          direction: LedgerDirection.DEBIT,
          amountVnd: payable
        },
        {
          accountCode: `liability:tenant:${tenantId}:user:${obligation.userId}:available`,
          accountName: "Tenant member available cashback",
          accountKind: LedgerAccountKind.LIABILITY,
          userId: obligation.userId,
          direction: LedgerDirection.CREDIT,
          amountVnd: payable
        }
      ]
    });
    if (!journal.created) continue;
    treasury = await tx.tenantTreasuryProjection.update({
      where: { tenantId },
      data: {
        availableVnd: { decrement: payable },
        paidVnd: { increment: payable },
        version: { increment: 1 }
      }
    });
    await tx.tenantMemberWalletProjection.update({
      where: { tenantId_userId: { tenantId, userId: obligation.userId } },
      data: {
        pendingFundingVnd: { decrement: payable },
        availableVnd: { increment: payable },
        version: { increment: 1 }
      }
    });
    await tx.tenantCashbackObligation.update({
      where: { id: obligation.id },
      data: {
        fundedVnd: { increment: payable },
        status: TenantObligationStatus.AVAILABLE,
        fundedAt: new Date()
      }
    });
    funded += 1;
    fundedVnd += payable;
  }
  return { funded, fundedVnd };
}

export async function syncTenantCashbackObligation(
  tx: Tx,
  input: {
    conversionId: string;
    tenantId: string;
    userId: string;
    cashbackVnd: bigint;
    payable: boolean;
    released: boolean;
    eventKey: string;
  }
): Promise<void> {
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
  if (tenant.kind !== "STANDARD" && tenant.kind !== "MASTER") return;

  const existing = await tx.tenantCashbackObligation.findUnique({
    where: { conversionId: input.conversionId }
  });
  const targetAmount = input.payable ? input.cashbackVnd : 0n;

  if (!existing) {
    if (targetAmount <= 0n) return;
    await ensureMemberWallet(tx, input.tenantId, input.userId);
    await tx.tenantCashbackObligation.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        conversionId: input.conversionId,
        amountVnd: targetAmount,
        status: input.released
          ? TenantObligationStatus.PENDING_FUNDING
          : TenantObligationStatus.LOCKED
      }
    });
    await tx.tenantMemberWalletProjection.update({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
      data: { pendingFundingVnd: { increment: targetAmount }, version: { increment: 1 } }
    });
    if (input.released) await allocatePendingTenantCashback(tx, input.tenantId);
    return;
  }

  if (targetAmount === existing.amountVnd) {
    if (existing.status === TenantObligationStatus.LOCKED && input.released) {
      await tx.tenantCashbackObligation.update({
        where: { id: existing.id },
        data: { status: TenantObligationStatus.PENDING_FUNDING }
      });
      await allocatePendingTenantCashback(tx, input.tenantId);
    }
    return;
  }
  if (targetAmount > existing.amountVnd) {
    const delta = targetAmount - existing.amountVnd;
    await ensureMemberWallet(tx, input.tenantId, input.userId);
    await tx.tenantCashbackObligation.update({
      where: { id: existing.id },
      data: {
        amountVnd: targetAmount,
        status: input.released
          ? TenantObligationStatus.PENDING_FUNDING
          : TenantObligationStatus.LOCKED
      }
    });
    await tx.tenantMemberWalletProjection.update({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
      data: { pendingFundingVnd: { increment: delta }, version: { increment: 1 } }
    });
    if (input.released) await allocatePendingTenantCashback(tx, input.tenantId);
    return;
  }

  const reduction = existing.amountVnd - targetAmount;
  const pending = existing.amountVnd - existing.fundedVnd - existing.recoveredVnd;
  const pendingReduction = reduction < pending ? reduction : pending;
  const afterPending = reduction - pendingReduction;
  const recoveredReduction =
    afterPending < existing.recoveredVnd ? afterPending : existing.recoveredVnd;
  const fundedReduction = afterPending - recoveredReduction;
  await ensureMemberWallet(tx, input.tenantId, input.userId);
  await ensureTreasury(tx, input.tenantId);
  await tx.$queryRaw`SELECT id FROM "TenantTreasuryProjection" WHERE "tenantId" = ${input.tenantId} FOR UPDATE`;
  await tx.$queryRaw`
    SELECT id FROM "TenantMemberWalletProjection"
    WHERE "tenantId" = ${input.tenantId} AND "userId" = ${input.userId}
    FOR UPDATE
  `;
  if (pendingReduction > 0n) {
    await tx.tenantMemberWalletProjection.update({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
      data: { pendingFundingVnd: { decrement: pendingReduction }, version: { increment: 1 } }
    });
  }
  let recoveryDebtAdded = recoveredReduction;
  if (fundedReduction > 0n) {
    const wallet = await tx.tenantMemberWalletProjection.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } }
    });
    const reclaimable =
      wallet.availableVnd < fundedReduction ? wallet.availableVnd : fundedReduction;
    if (reclaimable > 0n) {
      const journal = await postJournal(tx, {
        type: LedgerTransactionType.TENANT_RECOVERY,
        idempotencyKey: `tenant-obligation:${existing.id}:${input.eventKey}:reclaim`,
        description: "Hoàn cashback khả dụng về treasury do provider correction.",
        reference: input.conversionId,
        lines: [
          {
            accountCode: `liability:tenant:${input.tenantId}:user:${input.userId}:available`,
            accountName: "Tenant member available cashback",
            accountKind: LedgerAccountKind.LIABILITY,
            userId: input.userId,
            direction: LedgerDirection.DEBIT,
            amountVnd: reclaimable
          },
          {
            accountCode: `liability:tenant:${input.tenantId}:treasury`,
            accountName: "Tenant treasury liability",
            accountKind: LedgerAccountKind.LIABILITY,
            direction: LedgerDirection.CREDIT,
            amountVnd: reclaimable
          }
        ]
      });
      if (!journal.created) {
        throw new AppError("CONFLICT", "Correction tenant đã được ghi nhận trước đó.", 409);
      }
      const sourceAvailable =
        existing.fundedVnd - existing.reservedVnd - existing.paidVnd > 0n
          ? existing.fundedVnd - existing.reservedVnd - existing.paidVnd
          : 0n;
      const reclaimedFromSource = sourceAvailable < reclaimable ? sourceAvailable : reclaimable;
      const reclaimedFromOther = reclaimable - reclaimedFromSource;
      if (reclaimedFromOther > 0n) {
        await consumeOtherAvailableCashback(
          tx,
          input.tenantId,
          input.userId,
          existing.id,
          reclaimedFromOther
        );
      }
      await tx.tenantMemberWalletProjection.update({
        where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
        data: { availableVnd: { decrement: reclaimable }, version: { increment: 1 } }
      });
      await tx.tenantTreasuryProjection.update({
        where: { tenantId: input.tenantId },
        data: { availableVnd: { increment: reclaimable }, version: { increment: 1 } }
      });
    }
    const recoveryRequired = fundedReduction - reclaimable;
    if (recoveryRequired > 0n) {
      recoveryDebtAdded += recoveryRequired;
    }
  }
  if (recoveryDebtAdded > 0n) {
    const journal = await postJournal(tx, {
      type: LedgerTransactionType.TENANT_RECOVERY,
      idempotencyKey: `tenant-obligation:${existing.id}:${input.eventKey}:receivable`,
      description: "Ghi nhận khoản tenant cashback cần thu hồi từ member.",
      reference: input.conversionId,
      metadata: { tenantId: input.tenantId, userId: input.userId },
      lines: [
        {
          accountCode: `asset:tenant:${input.tenantId}:user:${input.userId}:recovery`,
          accountName: "Tenant member recovery receivable",
          accountKind: LedgerAccountKind.ASSET,
          userId: input.userId,
          direction: LedgerDirection.DEBIT,
          amountVnd: recoveryDebtAdded
        },
        {
          accountCode: `liability:tenant:${input.tenantId}:treasury`,
          accountName: "Tenant treasury liability",
          accountKind: LedgerAccountKind.LIABILITY,
          direction: LedgerDirection.CREDIT,
          amountVnd: recoveryDebtAdded
        }
      ]
    });
    if (!journal.created) {
      throw new AppError("CONFLICT", "Recovery receivable đã được ghi nhận trước đó.", 409);
    }
    await tx.tenantMemberWalletProjection.update({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
      data: { recoveryVnd: { increment: recoveryDebtAdded }, version: { increment: 1 } }
    });
  }
  const nextFunded = existing.fundedVnd - fundedReduction;
  const nextRecovered = existing.recoveredVnd - recoveredReduction;
  const nextPending = targetAmount - nextFunded - nextRecovered;
  await tx.tenantCashbackObligation.update({
    where: { id: existing.id },
    data: {
      amountVnd: targetAmount,
      fundedVnd: nextFunded,
      recoveredVnd: nextRecovered,
      recoveryRequiredVnd: { increment: recoveryDebtAdded },
      status:
        recoveryDebtAdded > 0n
          ? TenantObligationStatus.RECOVERY_REQUIRED
          : targetAmount === 0n
            ? TenantObligationStatus.CANCELLED
            : existing.reservedVnd > 0n
              ? TenantObligationStatus.RESERVED
              : existing.paidVnd >= nextFunded && nextFunded > 0n
                ? TenantObligationStatus.PAID
                : nextPending > 0n
                  ? TenantObligationStatus.PENDING_FUNDING
                  : nextFunded > 0n
                    ? TenantObligationStatus.AVAILABLE
                    : TenantObligationStatus.CANCELLED,
      cancelledAt: targetAmount === 0n ? new Date() : null
    }
  });
}

export async function createTenantFundingOrder(input: {
  actorUserId: string;
  tenantId?: string | undefined;
  amountVnd: bigint;
  idempotencyKey: string;
  requestHash: string;
  baseUrl: string;
}) {
  if (input.amountVnd < MIN_TENANT_FUNDING_VND || input.amountVnd > MAX_TENANT_FUNDING_VND) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Khoản nạp phải từ ${MIN_TENANT_FUNDING_VND} đến ${MAX_TENANT_FUNDING_VND} VND.`,
      400
    );
  }
  const context = await requireTenantMasterContext(input.actorUserId, input.tenantId);
  const tenant = context.ownedTenant;
  if (!tenant) {
    throw new AppError("VALIDATION_ERROR", "Không xác định được tenant.", 400);
  }
  await assertTenantFinanceGate(tenant, "topup");
  const existing = await db.tenantFundingOrder.findUnique({
    where: {
      tenantId_clientIdempotencyKey: {
        tenantId: tenant.id,
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
  const rows = await db.$queryRaw<Array<{ orderCode: bigint }>>`
    SELECT nextval('"TenantFundingOrder_order_code_seq"') AS "orderCode"
  `;
  const value = rows[0]?.orderCode;
  if (!value || value > 2_000_000_000n) {
    throw new AppError("INTERNAL_ERROR", "Không thể cấp mã funding order.", 500);
  }
  const orderCode = Number(value);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const description = `Nap quy ${tenant.slug}`.slice(0, 25);
  let order;
  try {
    order = await db.tenantFundingOrder.create({
      data: {
        tenantId: tenant.id,
        createdByUserId: input.actorUserId,
        orderCode,
        amountVnd: input.amountVnd,
        description,
        clientIdempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        expiresAt
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const concurrent = await db.tenantFundingOrder.findUnique({
      where: {
        tenantId_clientIdempotencyKey: {
          tenantId: tenant.id,
          clientIdempotencyKey: input.idempotencyKey
        }
      }
    });
    if (!concurrent || concurrent.requestHash !== input.requestHash) {
      throw new AppError("CONFLICT", "Idempotency-Key đã được dùng với dữ liệu khác.", 409);
    }
    if (!concurrent.checkoutUrl || !concurrent.qrCode) {
      throw new AppError("CONFLICT", "Funding order đang được khởi tạo, vui lòng thử lại.", 409);
    }
    return concurrent;
  }
  try {
    const link = await createTenantFundingPaymentLink({
      orderCode,
      amountVnd: input.amountVnd,
      description,
      returnUrl: `${input.baseUrl}/shop/${order.tenantId}/treasury?funding=success`,
      cancelUrl: `${input.baseUrl}/shop/${order.tenantId}/treasury?funding=cancelled`,
      expiresAt
    });
    return await db.tenantFundingOrder.update({
      where: { id: order.id },
      data: {
        paymentLinkId: link.paymentLinkId,
        checkoutUrl: link.checkoutUrl,
        qrCode: link.qrCode
      }
    });
  } catch (error) {
    await db.tenantFundingOrder.update({
      where: { id: order.id },
      data: {
        status: TenantFundingOrderStatus.UNKNOWN,
        requiresManualReview: false,
        reviewReason: "PAYMENT_LINK_CREATE_AMBIGUOUS"
      }
    });
    await scheduleFundingReconciliation({ fundingOrderId: order.id, sequence: 1 });
    throw error;
  }
}

export async function creditTenantFundingOrder(input: {
  orderCode: number;
  paymentLinkId: string;
  amountVnd: bigint;
  currency: string;
}) {
  return withSerializable(async (tx) => {
    const found = await tx.tenantFundingOrder.findUnique({ where: { orderCode: input.orderCode } });
    if (!found) throw new AppError("NOT_FOUND", "Funding order không tồn tại.", 404);
    await tx.$queryRaw`SELECT id FROM "TenantFundingOrder" WHERE id = ${found.id} FOR UPDATE`;
    const order = await tx.tenantFundingOrder.findUniqueOrThrow({
      where: { id: found.id },
      include: { tenant: true }
    });
    await assertTenantFinanceGate(order.tenant, "topup", tx);
    if (order.status === TenantFundingOrderStatus.PAID) return { duplicate: true, order };
    if (
      (order.status !== TenantFundingOrderStatus.PENDING &&
        order.status !== TenantFundingOrderStatus.UNKNOWN) ||
      (order.paymentLinkId !== null && order.paymentLinkId !== input.paymentLinkId) ||
      order.amountVnd !== input.amountVnd ||
      order.currency !== input.currency
    ) {
      throw new AppError("CONFLICT", "Webhook funding không khớp order.", 409);
    }
    await ensureTreasury(tx, order.tenantId);
    await tx.$queryRaw`SELECT id FROM "TenantTreasuryProjection" WHERE "tenantId" = ${order.tenantId} FOR UPDATE`;
    const journal = await postJournal(tx, {
      type: LedgerTransactionType.TENANT_FUNDING,
      idempotencyKey: `tenant-funding:${order.id}:paid`,
      description: "Ghi nhận tiền nạp treasury tenant qua PayOS.",
      reference: order.id,
      metadata: { tenantId: order.tenantId, paymentLinkId: input.paymentLinkId },
      lines: [
        {
          accountCode: `asset:tenant-funding:${order.tenantId}:cash`,
          accountName: "Tenant funding cash",
          accountKind: LedgerAccountKind.ASSET,
          direction: LedgerDirection.DEBIT,
          amountVnd: order.amountVnd
        },
        {
          accountCode: `liability:tenant:${order.tenantId}:treasury`,
          accountName: "Tenant treasury liability",
          accountKind: LedgerAccountKind.LIABILITY,
          direction: LedgerDirection.CREDIT,
          amountVnd: order.amountVnd
        }
      ]
    });
    if (journal.created) {
      await tx.tenantTreasuryProjection.update({
        where: { tenantId: order.tenantId },
        data: { availableVnd: { increment: order.amountVnd }, version: { increment: 1 } }
      });
    }
    const paid = await tx.tenantFundingOrder.update({
      where: { id: order.id },
      data: {
        status: TenantFundingOrderStatus.PAID,
        paymentLinkId: input.paymentLinkId,
        paidAt: new Date(),
        requiresManualReview: false,
        reviewReason: null
      }
    });
    await allocatePendingTenantCashback(tx, order.tenantId);
    return { duplicate: false, order: paid };
  });
}

export async function transferMasterWalletToTreasury(input: {
  actorUserId: string;
  tenantId?: string | undefined;
  amountVnd: bigint;
  idempotencyKey: string;
  requestHash: string;
}) {
  if (input.amountVnd <= 0n) {
    throw new AppError("VALIDATION_ERROR", "Số tiền chuyển phải lớn hơn 0.", 400);
  }
  const context = await requireTenantMasterContext(input.actorUserId, input.tenantId);
  const tenant = context.ownedTenant;
  if (!tenant) {
    throw new AppError("VALIDATION_ERROR", "Không xác định được tenant.", 400);
  }
  await assertTenantFinanceGate(tenant, "finance");
  return withSerializable(async (tx) => {
    const journalKey = `tenant-transfer:${tenant.id}:${input.idempotencyKey}`;
    const existing = await tx.ledgerTransaction.findUnique({
      where: { idempotencyKey: journalKey }
    });
    if (existing) {
      const metadata = existing.metadata;
      if (
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata) ||
        metadata.requestHash !== input.requestHash
      ) {
        throw new AppError("CONFLICT", "Idempotency-Key đã được dùng với dữ liệu khác.", 409);
      }
      return tx.tenantTreasuryProjection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    }
    await ensureTreasury(tx, tenant.id);
    await tx.$queryRaw`SELECT id FROM "WalletProjection" WHERE "userId" = ${input.actorUserId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "TenantTreasuryProjection" WHERE "tenantId" = ${tenant.id} FOR UPDATE`;
    const wallet = await tx.walletProjection.findUnique({ where: { userId: input.actorUserId } });
    if (!wallet || wallet.availableVnd < input.amountVnd) {
      throw new AppError("INSUFFICIENT_BALANCE", "Ví master không đủ số dư khả dụng.", 409);
    }
    const journal = await postJournal(tx, {
      type: LedgerTransactionType.TENANT_WALLET_TRANSFER,
      idempotencyKey: journalKey,
      description: "Chuyển cashback master wallet sang treasury tenant.",
      reference: tenant.id,
      createdById: input.actorUserId,
      metadata: { tenantId: tenant.id, requestHash: input.requestHash },
      lines: [
        {
          accountCode: `liability:user:${input.actorUserId}:available`,
          accountName: "User available cashback",
          accountKind: LedgerAccountKind.LIABILITY,
          userId: input.actorUserId,
          direction: LedgerDirection.DEBIT,
          amountVnd: input.amountVnd
        },
        {
          accountCode: `liability:tenant:${tenant.id}:treasury`,
          accountName: "Tenant treasury liability",
          accountKind: LedgerAccountKind.LIABILITY,
          direction: LedgerDirection.CREDIT,
          amountVnd: input.amountVnd
        }
      ]
    });
    if (journal.created) {
      await tx.walletProjection.update({
        where: { userId: input.actorUserId },
        data: { availableVnd: { decrement: input.amountVnd }, version: { increment: 1 } }
      });
      await tx.tenantTreasuryProjection.update({
        where: { tenantId: tenant.id },
        data: { availableVnd: { increment: input.amountVnd }, version: { increment: 1 } }
      });
      await allocatePendingTenantCashback(tx, tenant.id);
    }
    return tx.tenantTreasuryProjection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  });
}

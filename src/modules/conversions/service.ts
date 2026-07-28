import "server-only";

import {
  ConnectorType,
  ConversionStatus,
  EvidenceAuthority,
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  OrderValidationStatus,
  RiskHoldStatus,
  SettlementStatus,
  Prisma,
  type AffiliateAccount,
  type Conversion,
  type Platform
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  cashbackFromCommission,
  TENANT_AFFILIATE_TAX_BPS,
  tenantCashbackFromCommission
} from "@/lib/money";
import type { NormalizedConversion, NormalizedValidation } from "@/modules/connectors/types";
import { storeRawEvidence } from "@/modules/evidence/service";
import { postJournal, postPendingCashback } from "@/modules/ledger/service";

const AUTHORITY_WEIGHT: Record<EvidenceAuthority, number> = {
  AUXILIARY: 1,
  PROVISIONAL_AUTHORITATIVE: 2,
  AUTHORITATIVE: 3
};

function conversionStatus(value: NormalizedConversion["status"]): ConversionStatus {
  if (value === "validated") return ConversionStatus.VALIDATED;
  if (value === "rejected" || value === "returned" || value === "cancelled") {
    return ConversionStatus.REJECTED;
  }
  return ConversionStatus.PENDING;
}

function validationStatus(
  conversion: NormalizedConversion,
  holdDays: number | null
): OrderValidationStatus {
  if (conversion.status === "validated") return OrderValidationStatus.VALIDATED;
  if (conversion.status === "returned") return OrderValidationStatus.RETURNED;
  if (conversion.status === "cancelled") return OrderValidationStatus.CANCELLED;
  if (conversion.status === "rejected") return OrderValidationStatus.REJECTED;
  if (conversion.status === "review_required") return OrderValidationStatus.REVIEW_REQUIRED;
  if (conversion.status !== "delivered") return OrderValidationStatus.TRACKED;
  if (!conversion.deliveredAt || holdDays === null || holdDays < 4 || holdDays > 60) {
    return OrderValidationStatus.REVIEW_REQUIRED;
  }
  return OrderValidationStatus.VALIDATION_HOLD;
}

function validationDueAt(conversion: NormalizedConversion, holdDays: number | null): Date | null {
  if (conversion.status !== "delivered" || !conversion.deliveredAt || holdDays === null) {
    return null;
  }
  return new Date(conversion.deliveredAt.getTime() + holdDays * 24 * 60 * 60 * 1_000);
}

function correctedSettlementStatus(
  current: Conversion,
  nextStatus: ConversionStatus
): SettlementStatus {
  if (nextStatus !== ConversionStatus.REJECTED) return current.settlementStatus;
  if (current.settlementStatus === SettlementStatus.RELEASED || current.availableAt) {
    return SettlementStatus.REVERSED;
  }
  if (
    current.settlementStatus === SettlementStatus.INCLUDED_IN_RECONCILIATION ||
    current.settlementStatus === SettlementStatus.RECONCILIATION_CLOSED ||
    current.settlementStatus === SettlementStatus.FINANCE_CONFIRMED
  ) {
    return SettlementStatus.REVIEW_REQUIRED;
  }
  return current.settlementStatus;
}

function withholdingTaxBpsFromSnapshot(value: Prisma.JsonValue | undefined): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return TENANT_AFFILIATE_TAX_BPS;
  }
  const taxBps = (value as Prisma.JsonObject).withholdingTaxBps;
  return typeof taxBps === "number" && Number.isInteger(taxBps) && taxBps >= 0 && taxBps <= 10_000
    ? taxBps
    : TENANT_AFFILIATE_TAX_BPS;
}

async function applyConversionRevision(
  tx: Prisma.TransactionClient,
  input: {
    current: Conversion;
    next: NormalizedConversion;
    nextAuthority: EvidenceAuthority;
    rawEvidenceId: string;
    reason: string;
  }
): Promise<void> {
  const nextStatus = conversionStatus(input.next.status);
  const nextValidationStatus = validationStatus(input.next, input.current.validationHoldDays);
  const nextValidationDueAt = validationDueAt(input.next, input.current.validationHoldDays);
  const effectiveGross =
    nextStatus === ConversionStatus.REJECTED ? 0n : input.next.grossCommissionVnd;
  const effectiveNet = nextStatus === ConversionStatus.REJECTED ? 0n : input.next.netCommissionVnd;
  const withholdingTaxBps = input.current.tenantId
    ? input.current.withholdingTaxBps || TENANT_AFFILIATE_TAX_BPS
    : 0;
  const tenantCalculation = input.current.tenantId
    ? tenantCashbackFromCommission(
        input.next.netCommissionVnd,
        input.current.shareBps,
        withholdingTaxBps
      )
    : null;
  const effectiveWithholdingTax =
    nextStatus === ConversionStatus.REJECTED ? 0n : (tenantCalculation?.withholdingTaxVnd ?? 0n);
  const effectiveCashback =
    nextStatus === ConversionStatus.REJECTED
      ? 0n
      : (tenantCalculation?.cashbackVnd ??
        cashbackFromCommission(input.next.netCommissionVnd, input.current.shareBps));
  if (
    nextStatus === input.current.status &&
    effectiveGross === input.current.grossCommissionVnd &&
    effectiveNet === input.current.netCommissionVnd &&
    effectiveCashback === input.current.cashbackVnd &&
    input.nextAuthority === input.current.sourceAuthority &&
    nextValidationStatus === input.current.orderValidationStatus &&
    (input.next.rawOrderStatus ?? null) === input.current.rawOrderStatus &&
    (input.next.deliveredAt?.getTime() ?? null) === (input.current.deliveredAt?.getTime() ?? null)
  ) {
    await tx.conversion.update({
      where: { id: input.current.id },
      data: {
        rawEvidenceId: input.rawEvidenceId,
        orderStatusUpdatedAt: input.next.orderStatusUpdatedAt ?? new Date()
      }
    });
    return;
  }

  const sequence =
    (await tx.conversionRevision.count({ where: { conversionId: input.current.id } })) + 1;
  await tx.conversionRevision.create({
    data: {
      conversionId: input.current.id,
      sequence,
      previousStatus: input.current.status,
      newStatus: nextStatus,
      previousCommissionVnd: input.current.netCommissionVnd,
      newCommissionVnd: effectiveNet,
      previousCashbackVnd: input.current.cashbackVnd,
      newCashbackVnd: effectiveCashback,
      reason: input.reason,
      rawEvidenceId: input.rawEvidenceId
    }
  });

  const grossDelta = effectiveGross - input.current.grossCommissionVnd;
  const cashbackDelta = effectiveCashback - input.current.cashbackVnd;
  const platformDelta = grossDelta - cashbackDelta;
  if (
    input.current.userId &&
    !input.current.tenantId &&
    (grossDelta !== 0n || cashbackDelta !== 0n)
  ) {
    const bucket = input.current.availableAt ? "available" : "pending";
    const wallet = await tx.walletProjection.findUniqueOrThrow({
      where: { userId: input.current.userId }
    });
    const bucketBalance = bucket === "available" ? wallet.availableVnd : wallet.pendingVnd;
    const requestedDebit = cashbackDelta < 0n ? -cashbackDelta : 0n;
    const liabilityDebit = requestedDebit < bucketBalance ? requestedDebit : bucketBalance;
    const recoveryReceivable = requestedDebit - liabilityDebit;
    const lines: Array<{
      accountCode: string;
      accountName: string;
      accountKind: LedgerAccountKind;
      userId?: string;
      direction: LedgerDirection;
      amountVnd: bigint;
    }> = [];
    if (grossDelta !== 0n) {
      lines.push({
        accountCode: "asset:provider-receivable",
        accountName: "Provider receivable",
        accountKind: LedgerAccountKind.ASSET,
        direction: grossDelta > 0n ? LedgerDirection.DEBIT : LedgerDirection.CREDIT,
        amountVnd: grossDelta > 0n ? grossDelta : -grossDelta
      });
    }
    if (cashbackDelta > 0n) {
      lines.push({
        accountCode: `liability:user:${input.current.userId}:${bucket}`,
        accountName: `User ${bucket} cashback`,
        accountKind: LedgerAccountKind.LIABILITY,
        userId: input.current.userId,
        direction: LedgerDirection.CREDIT,
        amountVnd: cashbackDelta
      });
    } else {
      if (liabilityDebit > 0n) {
        lines.push({
          accountCode: `liability:user:${input.current.userId}:${bucket}`,
          accountName: `User ${bucket} cashback`,
          accountKind: LedgerAccountKind.LIABILITY,
          userId: input.current.userId,
          direction: LedgerDirection.DEBIT,
          amountVnd: liabilityDebit
        });
      }
      if (recoveryReceivable > 0n) {
        lines.push({
          accountCode: `asset:user-recovery:${input.current.userId}`,
          accountName: "User cashback recovery receivable",
          accountKind: LedgerAccountKind.ASSET,
          userId: input.current.userId,
          direction: LedgerDirection.DEBIT,
          amountVnd: recoveryReceivable
        });
      }
    }
    if (platformDelta !== 0n) {
      lines.push({
        accountCode: "revenue:platform",
        accountName: "Platform revenue",
        accountKind: LedgerAccountKind.REVENUE,
        direction: platformDelta > 0n ? LedgerDirection.CREDIT : LedgerDirection.DEBIT,
        amountVnd: platformDelta > 0n ? platformDelta : -platformDelta
      });
    }
    if (lines.length > 0) {
      const journal = await postJournal(tx, {
        type: LedgerTransactionType.CONVERSION_REVERSAL,
        idempotencyKey: `conversion:${input.current.id}:revision:${sequence}`,
        description: input.reason,
        reference: input.current.id,
        metadata: {
          previousStatus: input.current.status,
          nextStatus,
          rawEvidenceId: input.rawEvidenceId
        },
        lines
      });
      if (!journal.created) return;
    }
    if (cashbackDelta !== 0n) {
      await tx.walletProjection.update({
        where: { userId: input.current.userId },
        data:
          bucket === "available"
            ? {
                availableVnd:
                  cashbackDelta > 0n ? { increment: cashbackDelta } : { decrement: liabilityDebit },
                version: { increment: 1 }
              }
            : {
                pendingVnd:
                  cashbackDelta > 0n ? { increment: cashbackDelta } : { decrement: liabilityDebit },
                version: { increment: 1 }
              }
      });
    }
    if (recoveryReceivable > 0n) {
      await tx.user.update({
        where: { id: input.current.userId },
        data: { status: "SUSPENDED" }
      });
      await tx.reconciliationCase.create({
        data: {
          conversionId: input.current.id,
          platform: input.current.platform,
          severity: "USER_RECOVERY_REQUIRED",
          reason: "Provider correction exceeds the user's remaining cashback liability.",
          sourceSummary: {
            recoveryReceivableVnd: recoveryReceivable.toString(),
            rawEvidenceId: input.rawEvidenceId
          }
        }
      });
    }
  }

  if (
    nextStatus === ConversionStatus.REJECTED &&
    (input.current.settlementStatus === SettlementStatus.RELEASED || input.current.availableAt)
  ) {
    const settlementLine = await tx.settlementLine.findUnique({
      where: { conversionId: input.current.id }
    });
    if (settlementLine) {
      const reversedAt = new Date();
      await tx.settlementLine.update({
        where: { id: settlementLine.id },
        data: { status: "REVERSED" }
      });
      await tx.settlementBatch.update({
        where: { id: settlementLine.settlementBatchId },
        data: {
          status: "REVERSED",
          reversedAt
        }
      });
    }
  }

  if (input.current.userId && !input.current.tenantId) {
    if (nextStatus === ConversionStatus.REJECTED) {
      await tx.riskHold.updateMany({
        where: { conversionId: input.current.id },
        data: { status: RiskHoldStatus.CANCELLED }
      });
    } else if (
      nextValidationStatus === OrderValidationStatus.VALIDATION_HOLD &&
      !input.current.availableAt &&
      effectiveCashback > 0n
    ) {
      await tx.riskHold.upsert({
        where: { conversionId: input.current.id },
        create: {
          conversionId: input.current.id,
          userId: input.current.userId,
          amountVnd: effectiveCashback,
          reason: `Validation hold ${input.current.validationHoldDays} ngày.`,
          releaseAt: nextValidationDueAt!
        },
        update: {
          amountVnd: effectiveCashback,
          status: RiskHoldStatus.HELD,
          releaseAt: nextValidationDueAt!
        }
      });
    }
  }
  await tx.conversion.update({
    where: { id: input.current.id },
    data: {
      status: nextStatus,
      orderValidationStatus: nextValidationStatus,
      settlementStatus: correctedSettlementStatus(input.current, nextStatus),
      sourceAuthority: input.nextAuthority,
      grossCommissionVnd: effectiveGross,
      netCommissionVnd: effectiveNet,
      cashbackVnd: effectiveCashback,
      withholdingTaxBps,
      withholdingTaxVnd: effectiveWithholdingTax,
      validatedAt: nextStatus === ConversionStatus.VALIDATED ? new Date() : null,
      deliveredAt: input.next.deliveredAt ?? input.current.deliveredAt,
      validationDueAt: nextValidationDueAt,
      rawOrderStatus: input.next.rawOrderStatus ?? input.current.rawOrderStatus,
      orderStatusUpdatedAt: input.next.orderStatusUpdatedAt ?? new Date(),
      rejectedAt: nextStatus === ConversionStatus.REJECTED ? new Date() : null,
      rawEvidenceId: input.rawEvidenceId
    }
  });
}

export async function ingestConversion(input: {
  source: ConnectorType;
  authority: EvidenceAuthority;
  platform: Platform;
  affiliateAccount: AffiliateAccount;
  conversion: NormalizedConversion;
}): Promise<{ conversionId: string; created: boolean; deduplicated: boolean }> {
  const raw = await storeRawEvidence({
    provider: input.source,
    kind: "conversion",
    authority: input.authority,
    externalRef: input.conversion.externalOrderId,
    payload: input.conversion.payload
  });
  const exactIdentity = await db.externalConversionIdentity.findUnique({
    where: {
      source_affiliateAccountId_externalOrderId_externalItemKey: {
        source: input.source,
        affiliateAccountId: input.affiliateAccount.id,
        externalOrderId: input.conversion.externalOrderId,
        externalItemKey: input.conversion.externalItemKey
      }
    },
    include: { conversion: true }
  });
  if (exactIdentity) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await db.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Conversion" WHERE id = ${exactIdentity.conversionId} FOR UPDATE`;
            const current = await tx.conversion.findUniqueOrThrow({
              where: { id: exactIdentity.conversionId }
            });
            await applyConversionRevision(tx, {
              current,
              next: input.conversion,
              nextAuthority: input.authority,
              rawEvidenceId: raw.id,
              reason: "Provider reported a conversion correction."
            });
          },
          { isolationLevel: "Serializable" }
        );
        break;
      } catch (error) {
        const isRetryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2002" ||
            error.code === "P2034" ||
            error.code === "P2010" ||
            String(error.message).includes("40001") ||
            String(error.message).includes("deadlock"));
        if (!isRetryable || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    return { conversionId: exactIdentity.conversionId, created: false, deduplicated: true };
  }

  const sameOrder = await db.externalConversionIdentity.findFirst({
    where: {
      externalOrderId: input.conversion.externalOrderId,
      externalItemKey: input.conversion.externalItemKey,
      ...(input.platform === "SHOPEE_MARKETPLACE"
        ? {
            affiliateAccount: {
              platform: input.platform,
              scope: input.affiliateAccount.scope,
              tenantId: input.affiliateAccount.tenantId
            }
          }
        : { affiliateAccountId: input.affiliateAccount.id })
    },
    include: { conversion: true }
  });
  if (sameOrder) {
    return db.$transaction(async (tx) => {
      await tx.externalConversionIdentity.create({
        data: {
          source: input.source,
          affiliateAccountId: input.affiliateAccount.id,
          externalOrderId: input.conversion.externalOrderId,
          externalItemKey: input.conversion.externalItemKey,
          conversionId: sameOrder.conversionId
        }
      });
      if (
        AUTHORITY_WEIGHT[input.authority] > AUTHORITY_WEIGHT[sameOrder.conversion.sourceAuthority]
      ) {
        await tx.$queryRaw`SELECT id FROM "Conversion" WHERE id = ${sameOrder.conversionId} FOR UPDATE`;
        const current = await tx.conversion.findUniqueOrThrow({
          where: { id: sameOrder.conversionId }
        });
        await applyConversionRevision(tx, {
          current,
          next: input.conversion,
          nextAuthority: input.authority,
          rawEvidenceId: raw.id,
          reason: "Nguồn chính thức thay thế bằng chứng tạm thời."
        });
        if (
          input.conversion.netCommissionVnd !== sameOrder.conversion.netCommissionVnd ||
          conversionStatus(input.conversion.status) !== sameOrder.conversion.status
        ) {
          await tx.reconciliationCase.create({
            data: {
              conversionId: sameOrder.conversionId,
              platform: input.platform,
              externalOrderId: input.conversion.externalOrderId,
              severity: "FINANCE_REVIEW",
              reason: "Official source changed commission or validation state.",
              sourceSummary: {
                previousAuthority: sameOrder.conversion.sourceAuthority,
                nextAuthority: input.authority,
                previousCommissionVnd: sameOrder.conversion.netCommissionVnd.toString(),
                nextCommissionVnd: input.conversion.netCommissionVnd.toString()
              }
            }
          });
        }
      }
      return { conversionId: sameOrder.conversionId, created: false, deduplicated: true };
    });
  }

  const click = input.conversion.clickToken
    ? await db.affiliateClick.findFirst({
        where: {
          clickToken: input.conversion.clickToken,
          affiliateAccountId: input.affiliateAccount.id
        },
        include: { attribution: true }
      })
    : null;
  const merchant = click
    ? await db.merchant.findUniqueOrThrow({ where: { id: click.merchantId } })
    : await db.merchant.findFirstOrThrow({
        where: { platform: input.platform, active: true },
        orderBy: { createdAt: "asc" }
      });
  const shareBps = click?.attribution?.shareBps ?? merchant.defaultShareBps;
  const status = conversionStatus(input.conversion.status);
  const orderValidationStatus = validationStatus(
    input.conversion,
    input.affiliateAccount.validationHoldDays
  );
  const dueAt = validationDueAt(input.conversion, input.affiliateAccount.validationHoldDays);
  const withholdingTaxBps = click?.tenantId
    ? withholdingTaxBpsFromSnapshot(click.attribution?.snapshot)
    : 0;
  const tenantCalculation =
    click?.tenantId && status !== ConversionStatus.REJECTED
      ? tenantCashbackFromCommission(input.conversion.netCommissionVnd, shareBps, withholdingTaxBps)
      : null;
  const cashbackVnd = click
    ? click.tenantId
      ? (tenantCalculation?.cashbackVnd ?? 0n)
      : cashbackFromCommission(input.conversion.netCommissionVnd, shareBps)
    : 0n;
  return db.$transaction(
    async (tx) => {
      const conversion = await tx.conversion.create({
        data: {
          userId: click?.userId ?? null,
          clickId: click?.id ?? null,
          merchantId: merchant.id,
          campaignId: click?.campaignId ?? null,
          platform: input.platform,
          status,
          orderValidationStatus,
          settlementStatus: SettlementStatus.UNBILLED,
          sourceAuthority: input.authority,
          grossCommissionVnd: input.conversion.grossCommissionVnd,
          netCommissionVnd: input.conversion.netCommissionVnd,
          cashbackVnd,
          shareBps,
          withholdingTaxBps,
          withholdingTaxVnd: tenantCalculation?.withholdingTaxVnd ?? 0n,
          purchasedAt: input.conversion.purchasedAt,
          clickedAt: click?.clickedAt ?? null,
          validatedAt: status === ConversionStatus.VALIDATED ? new Date() : null,
          deliveredAt: input.conversion.deliveredAt ?? null,
          validationDueAt: dueAt,
          validationHoldDays: input.affiliateAccount.validationHoldDays,
          rawOrderStatus: input.conversion.rawOrderStatus ?? null,
          orderStatusUpdatedAt: input.conversion.orderStatusUpdatedAt ?? new Date(),
          rejectedAt: status === ConversionStatus.REJECTED ? new Date() : null,
          rawEvidenceId: raw.id,
          tenantId: click?.tenantId ?? null,
          externalIdentities: {
            create: {
              source: input.source,
              affiliateAccountId: input.affiliateAccount.id,
              externalOrderId: input.conversion.externalOrderId,
              externalItemKey: input.conversion.externalItemKey
            }
          },
          items: {
            create: input.conversion.items.map((item) => ({
              externalItemId: item.externalItemId,
              name: item.name ?? null,
              quantity: item.quantity,
              priceVnd: item.priceVnd ?? null,
              commissionVnd: item.commissionVnd,
              cashbackVnd: click?.tenantId
                ? status === ConversionStatus.REJECTED
                  ? 0n
                  : tenantCashbackFromCommission(item.commissionVnd, shareBps, withholdingTaxBps)
                      .cashbackVnd
                : cashbackFromCommission(item.commissionVnd, shareBps),
              payload: item.payload as Prisma.InputJsonValue
            }))
          },
          ...(click?.userId &&
          !click.tenantId &&
          dueAt &&
          orderValidationStatus === OrderValidationStatus.VALIDATION_HOLD
            ? {
                riskHold: {
                  create: {
                    userId: click.userId,
                    amountVnd: cashbackVnd,
                    reason: `Validation hold ${input.affiliateAccount.validationHoldDays} ngày.`,
                    releaseAt: dueAt
                  }
                }
              }
            : {})
        }
      });
      if (
        click?.userId &&
        !click.tenantId &&
        cashbackVnd > 0n &&
        status !== ConversionStatus.REJECTED
      ) {
        await postPendingCashback(tx, {
          userId: click.userId,
          conversionId: conversion.id,
          grossCommissionVnd: input.conversion.grossCommissionVnd,
          cashbackVnd
        });
      }
      return { conversionId: conversion.id, created: true, deduplicated: false };
    },
    { isolationLevel: "Serializable" }
  );
}

export async function ingestValidation(input: {
  source: ConnectorType;
  authority: EvidenceAuthority;
  platform: Platform;
  affiliateAccount: AffiliateAccount;
  validation: NormalizedValidation;
}): Promise<{ conversionId: string | null; matched: boolean }> {
  const raw = await storeRawEvidence({
    provider: input.source,
    kind: "order-validation",
    authority: input.authority,
    externalRef: input.validation.externalOrderId,
    payload: input.validation.payload
  });
  const identity = await db.externalConversionIdentity.findUnique({
    where: {
      source_affiliateAccountId_externalOrderId_externalItemKey: {
        source: input.source,
        affiliateAccountId: input.affiliateAccount.id,
        externalOrderId: input.validation.externalOrderId,
        externalItemKey: input.validation.externalItemKey
      }
    }
  });
  if (!identity) {
    await db.reconciliationCase.create({
      data: {
        platform: input.platform,
        externalOrderId: input.validation.externalOrderId,
        severity: "UNMATCHED_ORDER_VALIDATION",
        reason: "Provider order validation does not match a canonical conversion.",
        sourceSummary: {
          affiliateAccountId: input.affiliateAccount.id,
          externalItemKey: input.validation.externalItemKey,
          rawEvidenceId: raw.id
        }
      }
    });
    return { conversionId: null, matched: false };
  }
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "Conversion" WHERE id = ${identity.conversionId} FOR UPDATE
      `;
      const current = await tx.conversion.findUniqueOrThrow({
        where: { id: identity.conversionId }
      });
      await applyConversionRevision(tx, {
        current,
        next: {
          externalOrderId: input.validation.externalOrderId,
          externalItemKey: input.validation.externalItemKey,
          purchasedAt: current.purchasedAt,
          orderStatusUpdatedAt: input.validation.validatedAt,
          rawOrderStatus: input.validation.rawOrderStatus,
          grossCommissionVnd: input.validation.commissionVnd,
          netCommissionVnd: input.validation.commissionVnd,
          status: input.validation.status,
          items: [],
          payload: input.validation.payload
        },
        nextAuthority: input.authority,
        rawEvidenceId: raw.id,
        reason: "Provider order reconciliation updated validation state."
      });
    },
    { isolationLevel: "Serializable" }
  );
  return { conversionId: identity.conversionId, matched: true };
}

export async function releaseDueSafetyHolds(): Promise<{
  validated: number;
  reviewRequired: number;
}> {
  const now = new Date();
  const conversions = await db.conversion.findMany({
    where: {
      orderValidationStatus: OrderValidationStatus.VALIDATION_HOLD,
      validationDueAt: { lte: now }
    },
    include: {
      rawEvidence: true,
      riskHold: true,
      externalIdentities: { select: { affiliateAccountId: true } }
    }
  });
  let validated = 0;
  let reviewRequired = 0;
  for (const conversion of conversions) {
    const affiliateAccountId = conversion.externalIdentities[0]?.affiliateAccountId;
    const connector = await db.connectorConfig.findFirst({
      where: {
        ...(affiliateAccountId ? { affiliateAccountId } : {}),
        platform: conversion.platform,
        connectorType: conversion.rawEvidence.provider,
        enabled: true,
        mode: { in: ["ACTIVE", "SHADOW"] }
      },
      include: { health: true }
    });
    const isManualShopee = conversion.rawEvidence.provider === ConnectorType.SHOPEE_DIRECT;
    const freshnessMs = isManualShopee ? 36 * 60 * 60 * 1_000 : 30 * 60 * 1_000;
    const graceMs = isManualShopee ? 36 * 60 * 60 * 1_000 : 2 * 60 * 60 * 1_000;
    const connectorHealthy =
      connector?.health?.status === "ACTIVE" &&
      connector.health.lastSuccessAt !== null &&
      connector.health.lastSuccessAt >= new Date(Date.now() - freshnessMs);
    const observedAfterDue =
      conversion.validationDueAt !== null &&
      conversion.rawEvidence.capturedAt >= conversion.validationDueAt;
    const authoritySufficient =
      conversion.sourceAuthority === EvidenceAuthority.AUTHORITATIVE ||
      conversion.sourceAuthority === EvidenceAuthority.PROVISIONAL_AUTHORITATIVE;
    const openReconciliation = await db.reconciliationCase.count({
      where: { conversionId: conversion.id, status: "OPEN" }
    });
    if (
      (!connectorHealthy || !observedAfterDue) &&
      conversion.validationDueAt !== null &&
      now < new Date(conversion.validationDueAt.getTime() + graceMs)
    ) {
      continue;
    }
    if (!connectorHealthy || !observedAfterDue || !authoritySufficient || openReconciliation > 0) {
      await db.$transaction([
        db.conversion.update({
          where: { id: conversion.id },
          data: { orderValidationStatus: OrderValidationStatus.REVIEW_REQUIRED }
        }),
        ...(conversion.riskHold
          ? [
              db.riskHold.update({
                where: { id: conversion.riskHold.id },
                data: { status: RiskHoldStatus.REVIEW_REQUIRED }
              })
            ]
          : [])
      ]);
      reviewRequired += 1;
      continue;
    }
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Conversion" WHERE id = ${conversion.id} FOR UPDATE`;
        const current = await tx.conversion.findUniqueOrThrow({ where: { id: conversion.id } });
        if (current.orderValidationStatus !== OrderValidationStatus.VALIDATION_HOLD) return;
        await tx.conversion.update({
          where: { id: conversion.id },
          data: {
            status: ConversionStatus.VALIDATED,
            orderValidationStatus: OrderValidationStatus.VALIDATED,
            validatedAt: now
          }
        });
        if (conversion.riskHold) {
          await tx.riskHold.update({
            where: { id: conversion.riskHold.id },
            data: { status: RiskHoldStatus.RELEASED }
          });
        }
      },
      { isolationLevel: "Serializable" }
    );
    validated += 1;
  }
  return { validated, reviewRequired };
}

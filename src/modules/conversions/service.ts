import "server-only";

import {
  ConnectorType,
  ConversionStatus,
  EvidenceAuthority,
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  RiskHoldStatus,
  type AffiliateAccount,
  type Conversion,
  type Platform,
  type Prisma
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  BETA_DAILY_AVAILABLE_LIMIT_VND,
  cashbackFromCommission,
  startOfVietnamDay
} from "@/lib/money";
import type { NormalizedConversion } from "@/modules/connectors/types";
import { storeRawEvidence } from "@/modules/evidence/service";
import { postJournal, postPendingCashback, releaseCashback } from "@/modules/ledger/service";
import { featureEnabled } from "@/modules/flags/service";

const AUTHORITY_WEIGHT: Record<EvidenceAuthority, number> = {
  AUXILIARY: 1,
  PROVISIONAL_AUTHORITATIVE: 2,
  AUTHORITATIVE: 3
};

function conversionStatus(value: NormalizedConversion["status"]): ConversionStatus {
  if (value === "validated") return ConversionStatus.VALIDATED;
  if (value === "rejected") return ConversionStatus.REJECTED;
  return ConversionStatus.PENDING;
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
  const effectiveGross =
    nextStatus === ConversionStatus.REJECTED ? 0n : input.next.grossCommissionVnd;
  const effectiveNet = nextStatus === ConversionStatus.REJECTED ? 0n : input.next.netCommissionVnd;
  const effectiveCashback =
    nextStatus === ConversionStatus.REJECTED
      ? 0n
      : cashbackFromCommission(input.next.netCommissionVnd, input.current.shareBps);
  if (
    nextStatus === input.current.status &&
    effectiveGross === input.current.grossCommissionVnd &&
    effectiveNet === input.current.netCommissionVnd &&
    effectiveCashback === input.current.cashbackVnd &&
    input.nextAuthority === input.current.sourceAuthority
  ) {
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
  if (input.current.userId && (grossDelta !== 0n || cashbackDelta !== 0n)) {
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
      await postJournal(tx, {
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

  if (input.current.userId) {
    if (nextStatus === ConversionStatus.REJECTED) {
      await tx.riskHold.updateMany({
        where: { conversionId: input.current.id },
        data: { status: RiskHoldStatus.CANCELLED }
      });
    } else if (
      nextStatus === ConversionStatus.VALIDATED &&
      !input.current.availableAt &&
      effectiveCashback > 0n
    ) {
      await tx.riskHold.upsert({
        where: { conversionId: input.current.id },
        create: {
          conversionId: input.current.id,
          userId: input.current.userId,
          amountVnd: effectiveCashback,
          reason: "Validation safety hold 7 ngày.",
          releaseAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        },
        update: {
          amountVnd: effectiveCashback,
          status: RiskHoldStatus.HELD,
          releaseAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });
    }
  }
  await tx.conversion.update({
    where: { id: input.current.id },
    data: {
      status: nextStatus,
      sourceAuthority: input.nextAuthority,
      grossCommissionVnd: effectiveGross,
      netCommissionVnd: effectiveNet,
      cashbackVnd: effectiveCashback,
      validatedAt: nextStatus === ConversionStatus.VALIDATED ? new Date() : null,
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
    return { conversionId: exactIdentity.conversionId, created: false, deduplicated: true };
  }

  const sameOrder = await db.externalConversionIdentity.findFirst({
    where: {
      externalOrderId: input.conversion.externalOrderId,
      externalItemKey: input.conversion.externalItemKey,
      affiliateAccount: { platform: input.platform }
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
    ? await db.affiliateClick.findUnique({
        where: { clickToken: input.conversion.clickToken },
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
  const cashbackVnd = click
    ? cashbackFromCommission(input.conversion.netCommissionVnd, shareBps)
    : 0n;
  const status = conversionStatus(input.conversion.status);
  const releaseAt =
    status === ConversionStatus.VALIDATED
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      : undefined;

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
          sourceAuthority: input.authority,
          grossCommissionVnd: input.conversion.grossCommissionVnd,
          netCommissionVnd: input.conversion.netCommissionVnd,
          cashbackVnd,
          shareBps,
          purchasedAt: input.conversion.purchasedAt,
          clickedAt: click?.clickedAt ?? null,
          validatedAt: status === ConversionStatus.VALIDATED ? new Date() : null,
          rejectedAt: status === ConversionStatus.REJECTED ? new Date() : null,
          rawEvidenceId: raw.id,
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
              cashbackVnd: cashbackFromCommission(item.commissionVnd, shareBps),
              payload: item.payload as Prisma.InputJsonValue
            }))
          },
          ...(click?.userId && releaseAt
            ? {
                riskHold: {
                  create: {
                    userId: click.userId,
                    amountVnd: cashbackVnd,
                    reason:
                      input.authority === EvidenceAuthority.PROVISIONAL_AUTHORITATIVE
                        ? "AddLiveTag safety hold 7 ngày."
                        : "Validation safety hold.",
                    releaseAt
                  }
                }
              }
            : {})
        }
      });
      if (click?.userId && cashbackVnd > 0n && status !== ConversionStatus.REJECTED) {
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

export async function releaseDueSafetyHolds(): Promise<{
  released: number;
  reviewRequired: number;
}> {
  if (!(await featureEnabled("cashback.release.enabled", false))) {
    return { released: 0, reviewRequired: 0 };
  }
  const now = new Date();
  const holds = await db.riskHold.findMany({
    where: { status: RiskHoldStatus.HELD, releaseAt: { lte: now } },
    include: { conversion: true }
  });
  let released = 0;
  let reviewRequired = 0;
  for (const hold of holds) {
    const staleConnector = await db.connectorHealth.findFirst({
      where: {
        connectorConfig: { platform: hold.conversion.platform },
        OR: [
          { lastSuccessAt: null },
          { lastSuccessAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } }
        ]
      }
    });
    if (staleConnector) continue;
    const dailyReleased = await db.conversion.aggregate({
      where: {
        userId: hold.userId,
        availableAt: { gte: startOfVietnamDay() }
      },
      _sum: { cashbackVnd: true }
    });
    if ((dailyReleased._sum.cashbackVnd ?? 0n) + hold.amountVnd > BETA_DAILY_AVAILABLE_LIMIT_VND) {
      await db.riskHold.update({
        where: { id: hold.id },
        data: { status: RiskHoldStatus.REVIEW_REQUIRED }
      });
      reviewRequired += 1;
      continue;
    }
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RiskHold" WHERE id = ${hold.id} FOR UPDATE`;
      const current = await tx.riskHold.findUniqueOrThrow({ where: { id: hold.id } });
      if (current.status !== RiskHoldStatus.HELD) return;
      await releaseCashback(tx, {
        userId: hold.userId,
        conversionId: hold.conversionId,
        amountVnd: hold.amountVnd
      });
      await tx.riskHold.update({
        where: { id: hold.id },
        data: { status: RiskHoldStatus.RELEASED }
      });
      await tx.conversion.update({
        where: { id: hold.conversionId },
        data: { availableAt: now }
      });
      await tx.notification.create({
        data: {
          userId: hold.userId,
          type: "cashback.available",
          title: "Cashback đã khả dụng",
          body: "Một khoản cashback đã được xác minh và chuyển vào số dư khả dụng.",
          deepLink: "/app/wallet"
        }
      });
    });
    released += 1;
  }
  return { released, reviewRequired };
}

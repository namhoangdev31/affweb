import "server-only";

import {
  ConnectorType,
  EvidenceAuthority,
  OrderValidationStatus,
  Prisma,
  ProviderAccountScope,
  SettlementBatchStatus,
  SettlementLineStatus,
  SettlementStatus
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { BETA_DAILY_AVAILABLE_LIMIT_VND, parseVndAmount, startOfVietnamDay } from "@/lib/money";
import { storeRawEvidence } from "@/modules/evidence/service";
import { releaseCashback } from "@/modules/ledger/service";

export type FinanceSettlementInput = {
  affiliateAccountId: string;
  externalReference: string;
  totalAmountVnd: string;
  reason: string;
  lines: Array<{
    externalOrderId: string;
    externalItemKey: string;
    amountVnd: string;
  }>;
  evidence: unknown;
};

export async function createFinanceSettlementBatch(input: {
  actorUserId: string;
  idempotencyKey: string;
  requestHash: string;
  settlement: FinanceSettlementInput;
}) {
  const existing = await db.settlementBatch.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });
  if (existing) {
    if (existing.requestHash !== input.requestHash) {
      throw new AppError("CONFLICT", "Idempotency-Key đã được dùng với dữ liệu khác.", 409);
    }
    return existing;
  }
  const account = await db.affiliateAccount.findUnique({
    where: { id: input.settlement.affiliateAccountId }
  });
  if (
    !account ||
    !account.enabled ||
    account.scope !== ProviderAccountScope.PLATFORM_MANAGED ||
    account.tenantId !== null
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Finance settlement chỉ áp dụng cho platform-managed account.",
      400
    );
  }
  if (
    account.connectorType !== ConnectorType.LAZADA_OPEN_API &&
    account.connectorType !== ConnectorType.ACCESSTRADE_API &&
    account.connectorType !== ConnectorType.SHOPEE_DIRECT
  ) {
    throw new AppError("VALIDATION_ERROR", "Provider account không hỗ trợ settlement.", 400);
  }
  const parsedTotal = parseVndAmount(input.settlement.totalAmountVnd, "totalAmountVnd");
  const parsedLines = input.settlement.lines.map((line) => ({
    ...line,
    amountVnd: parseVndAmount(line.amountVnd, "line.amountVnd")
  }));
  if (
    parsedTotal <= 0n ||
    parsedLines.length === 0 ||
    parsedLines.some((line) => line.amountVnd <= 0n)
  ) {
    throw new AppError("VALIDATION_ERROR", "Settlement amounts phải lớn hơn 0.", 400);
  }
  if (parsedLines.reduce((sum, line) => sum + line.amountVnd, 0n) !== parsedTotal) {
    throw new AppError("VALIDATION_ERROR", "Tổng các settlement line không khớp tổng batch.", 400);
  }
  const uniqueKeys = new Set(
    parsedLines.map((line) => `${line.externalOrderId}\u0000${line.externalItemKey}`)
  );
  if (uniqueKeys.size !== parsedLines.length) {
    throw new AppError("VALIDATION_ERROR", "Settlement chứa line trùng lặp.", 400);
  }
  const raw = await storeRawEvidence({
    provider: account.connectorType,
    kind: "finance_settlement",
    authority: EvidenceAuthority.AUTHORITATIVE,
    externalRef: input.settlement.externalReference,
    payload: {
      externalReference: input.settlement.externalReference,
      totalAmountVnd: input.settlement.totalAmountVnd,
      lines: input.settlement.lines,
      evidence: input.settlement.evidence
    },
    schemaVersion: 1
  });
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`;
        const replay = await tx.settlementBatch.findUnique({
          where: { idempotencyKey: input.idempotencyKey }
        });
        if (replay) {
          if (replay.requestHash !== input.requestHash) {
            throw new AppError("CONFLICT", "Idempotency-Key đã được dùng với dữ liệu khác.", 409);
          }
          return replay;
        }
        const lockedAccount = await tx.affiliateAccount.findUniqueOrThrow({
          where: { id: account.id }
        });
        await tx.$queryRaw`
          SELECT id FROM "AffiliateAccount" WHERE id = ${lockedAccount.id} FOR UPDATE
        `;
        const matches = [];
        for (const line of parsedLines) {
          const identity = await tx.externalConversionIdentity.findUnique({
            where: {
              source_affiliateAccountId_externalOrderId_externalItemKey: {
                source: account.connectorType,
                affiliateAccountId: account.id,
                externalOrderId: line.externalOrderId,
                externalItemKey: line.externalItemKey
              }
            },
            include: { conversion: true }
          });
          if (!identity) {
            throw new AppError(
              "VALIDATION_ERROR",
              "Settlement có line không khớp conversion.",
              400
            );
          }
          matches.push({ line, conversion: identity.conversion });
        }
        const conversionIds = matches.map(({ conversion }) => conversion.id).sort();
        await tx.$queryRaw`
          SELECT id FROM "Conversion"
          WHERE id IN (${Prisma.join(conversionIds)})
          ORDER BY id
          FOR UPDATE
        `;
        const releasedPerUser = new Map<string, bigint>();
        for (const { line, conversion } of matches) {
          const current = await tx.conversion.findUniqueOrThrow({
            where: { id: conversion.id }
          });
          if (
            current.tenantId ||
            !current.userId ||
            current.orderValidationStatus !== OrderValidationStatus.VALIDATED ||
            current.settlementStatus !== SettlementStatus.UNBILLED ||
            current.netCommissionVnd !== line.amountVnd
          ) {
            throw new AppError(
              "VALIDATION_ERROR",
              "Conversion chưa đủ điều kiện hoặc số tiền không khớp settlement.",
              400
            );
          }
          releasedPerUser.set(
            current.userId,
            (releasedPerUser.get(current.userId) ?? 0n) + current.cashbackVnd
          );
        }
        for (const [userId, amountVnd] of releasedPerUser) {
          const dailyReleased = await tx.conversion.aggregate({
            where: {
              userId,
              availableAt: { gte: startOfVietnamDay() }
            },
            _sum: { cashbackVnd: true }
          });
          if ((dailyReleased._sum.cashbackVnd ?? 0n) + amountVnd > BETA_DAILY_AVAILABLE_LIMIT_VND) {
            throw new AppError(
              "PAYOUT_LIMIT",
              "Settlement vượt giới hạn cashback khả dụng trong ngày.",
              409
            );
          }
        }
        const evidence = await tx.settlementEvidence.create({
          data: {
            affiliateAccountId: account.id,
            rawEvidenceId: raw.id,
            fileSha256: raw.sha256,
            provider: account.connectorType,
            kind: "FINANCE_SETTLEMENT",
            externalReference: input.settlement.externalReference,
            importedByUserId: input.actorUserId,
            metadata: {
              accountFingerprint: account.fingerprint,
              lineCount: parsedLines.length,
              reason: input.settlement.reason
            }
          }
        });
        const now = new Date();
        const batch = await tx.settlementBatch.create({
          data: {
            affiliateAccountId: account.id,
            evidenceId: evidence.id,
            provider: account.connectorType,
            externalReference: input.settlement.externalReference,
            status: SettlementBatchStatus.CLOSED,
            totalAmountVnd: parsedTotal,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            createdByUserId: input.actorUserId,
            closedAt: now,
            lines: {
              create: matches.map(({ line, conversion }) => ({
                conversionId: conversion.id,
                externalOrderId: line.externalOrderId,
                externalItemKey: line.externalItemKey,
                amountVnd: line.amountVnd,
                status: SettlementLineStatus.MATCHED
              }))
            }
          }
        });
        for (const { conversion } of matches) {
          const current = await tx.conversion.findUniqueOrThrow({
            where: { id: conversion.id }
          });
          if (current.cashbackVnd > 0n) {
            await releaseCashback(tx, {
              userId: current.userId!,
              conversionId: current.id,
              amountVnd: current.cashbackVnd
            });
          }
          await tx.conversion.update({
            where: { id: current.id },
            data: {
              settlementStatus: SettlementStatus.RELEASED,
              availableAt: now
            }
          });
          await tx.settlementLine.update({
            where: { conversionId: current.id },
            data: {
              status: SettlementLineStatus.RELEASED,
              releasedAt: now
            }
          });
        }
        await tx.settlementBatch.update({
          where: { id: batch.id },
          data: {
            status: SettlementBatchStatus.RELEASED,
            releasedAt: now
          }
        });
        await tx.auditLog.create({
          data: {
            actorUserId: input.actorUserId,
            action: "settlement_batch.released",
            entityType: "SettlementBatch",
            entityId: batch.id,
            after: {
              provider: account.connectorType,
              accountFingerprint: account.fingerprint,
              externalReference: input.settlement.externalReference,
              totalAmountVnd: parsedTotal.toString(),
              lineCount: parsedLines.length,
              evidenceSha256: raw.sha256,
              reason: input.settlement.reason
            }
          }
        });
        return tx.settlementBatch.findUniqueOrThrow({ where: { id: batch.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await db.settlementBatch.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (replay && replay.requestHash === input.requestHash) return replay;
    }
    throw error;
  }
}

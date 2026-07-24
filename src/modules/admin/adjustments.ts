import "server-only";

import {
  AdjustmentStatus,
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  Prisma
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";
import { postJournal } from "@/modules/ledger/service";

export async function createAdjustment(input: {
  targetUserId: string;
  amountVnd: bigint;
  reason: string;
  createdByUserId: string;
}) {
  if (input.amountVnd === 0n || input.reason.trim().length < 12) {
    throw new AppError("VALIDATION_ERROR", "Adjustment cần số tiền khác 0 và lý do đầy đủ.", 400);
  }
  await requireRecentFinancePasskey(input.createdByUserId);
  return db.$transaction(async (tx) => {
    const adjustment = await tx.balanceAdjustment.create({
      data: {
        targetUserId: input.targetUserId,
        amountVnd: input.amountVnd,
        reason: input.reason.trim(),
        createdByUserId: input.createdByUserId
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.createdByUserId,
        action: "adjustment.created",
        entityType: "BalanceAdjustment",
        entityId: adjustment.id,
        after: {
          targetUserId: input.targetUserId,
          amountVnd: input.amountVnd.toString(),
          reason: input.reason.trim()
        }
      }
    });
    return adjustment;
  });
}

export async function reviewAdjustment(id: string, reviewerUserId: string) {
  await requireRecentFinancePasskey(reviewerUserId);
  return db.$transaction(async (tx) => {
    const adjustment = await tx.balanceAdjustment.findUniqueOrThrow({ where: { id } });
    if (
      adjustment.status !== AdjustmentStatus.DRAFT ||
      adjustment.createdByUserId === reviewerUserId
    ) {
      throw new AppError("SEPARATION_OF_DUTIES", "Người tạo không được tự review.", 409);
    }
    const updated = await tx.balanceAdjustment.update({
      where: { id },
      data: {
        status: AdjustmentStatus.REVIEWED,
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date()
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: reviewerUserId,
        action: "adjustment.reviewed",
        entityType: "BalanceAdjustment",
        entityId: id,
        before: { status: adjustment.status },
        after: { status: AdjustmentStatus.REVIEWED }
      }
    });
    return updated;
  });
}

export async function approveAndPostAdjustment(id: string, approverUserId: string) {
  await requireRecentFinancePasskey(approverUserId);
  return db.$transaction(
    async (tx) => {
      const adjustment = await tx.balanceAdjustment.findUniqueOrThrow({ where: { id } });
      if (
        adjustment.status !== AdjustmentStatus.REVIEWED ||
        !adjustment.reviewedByUserId ||
        adjustment.reviewedByUserId === approverUserId ||
        adjustment.createdByUserId === approverUserId
      ) {
        throw new AppError(
          "SEPARATION_OF_DUTIES",
          "Creator, reviewer và approver phải là các tài khoản phù hợp và tách biệt.",
          409
        );
      }
      await tx.$queryRaw`
        SELECT id FROM "WalletProjection" WHERE "userId" = ${adjustment.targetUserId} FOR UPDATE
      `;
      const wallet = await tx.walletProjection.findUnique({
        where: { userId: adjustment.targetUserId }
      });
      if (adjustment.amountVnd < 0n && (!wallet || wallet.availableVnd < -adjustment.amountVnd)) {
        throw new AppError("INSUFFICIENT_BALANCE", "Không đủ available balance để giảm.", 409);
      }
      const amount = adjustment.amountVnd < 0n ? -adjustment.amountVnd : adjustment.amountVnd;
      const positive = adjustment.amountVnd > 0n;
      await postJournal(tx, {
        type: LedgerTransactionType.MANUAL_ADJUSTMENT,
        idempotencyKey: `adjustment:${adjustment.id}:posted`,
        description: adjustment.reason,
        reference: adjustment.id,
        createdById: approverUserId,
        metadata: { reviewerUserId: adjustment.reviewedByUserId },
        lines: positive
          ? [
              {
                accountCode: "expense:cashback-adjustment",
                accountName: "Cashback adjustment expense",
                accountKind: LedgerAccountKind.EXPENSE,
                direction: LedgerDirection.DEBIT,
                amountVnd: amount
              },
              {
                accountCode: `liability:user:${adjustment.targetUserId}:available`,
                accountName: "User available cashback",
                accountKind: LedgerAccountKind.LIABILITY,
                userId: adjustment.targetUserId,
                direction: LedgerDirection.CREDIT,
                amountVnd: amount
              }
            ]
          : [
              {
                accountCode: `liability:user:${adjustment.targetUserId}:available`,
                accountName: "User available cashback",
                accountKind: LedgerAccountKind.LIABILITY,
                userId: adjustment.targetUserId,
                direction: LedgerDirection.DEBIT,
                amountVnd: amount
              },
              {
                accountCode: "revenue:cashback-adjustment",
                accountName: "Cashback adjustment recovery",
                accountKind: LedgerAccountKind.REVENUE,
                direction: LedgerDirection.CREDIT,
                amountVnd: amount
              }
            ]
      });
      await tx.walletProjection.upsert({
        where: { userId: adjustment.targetUserId },
        create: {
          userId: adjustment.targetUserId,
          availableVnd: adjustment.amountVnd
        },
        update: {
          availableVnd: { increment: adjustment.amountVnd },
          version: { increment: 1 }
        }
      });
      const updated = await tx.balanceAdjustment.update({
        where: { id },
        data: {
          status: AdjustmentStatus.POSTED,
          approvedByUserId: approverUserId,
          approvedAt: new Date(),
          postedAt: new Date()
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: approverUserId,
          action: "adjustment.posted",
          entityType: "BalanceAdjustment",
          entityId: id,
          before: { status: adjustment.status },
          after: {
            status: AdjustmentStatus.POSTED,
            amountVnd: adjustment.amountVnd.toString()
          }
        }
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

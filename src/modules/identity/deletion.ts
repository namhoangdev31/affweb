import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import {
  AccountDeletionStatus,
  ConversionStatus,
  PayoutStatus,
  RiskHoldStatus,
  TenantObligationStatus,
  TenantPayoutStatus
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

const OPEN_PAYOUT_STATUSES: PayoutStatus[] = [
  PayoutStatus.DRAFT,
  PayoutStatus.RESERVED,
  PayoutStatus.REVIEWED,
  PayoutStatus.APPROVED,
  PayoutStatus.SUBMITTED,
  PayoutStatus.PROCESSING,
  PayoutStatus.UNKNOWN
];

export async function deletionBlockers(userId: string): Promise<string[]> {
  const [
    wallet,
    openConversions,
    openPayouts,
    activeHolds,
    tenantWallets,
    openTenantPayouts,
    ownedTenant
  ] = await Promise.all([
    db.walletProjection.findUnique({
      where: { userId },
      select: { pendingVnd: true, availableVnd: true, reservedVnd: true }
    }),
    db.conversion.count({
      where: {
        userId,
        OR: [
          { status: { in: [ConversionStatus.DISCOVERED, ConversionStatus.PENDING] } },
          {
            status: ConversionStatus.VALIDATED,
            availableAt: null
          }
        ]
      }
    }),
    db.payoutTicket.count({
      where: { userId, status: { in: OPEN_PAYOUT_STATUSES } }
    }),
    db.riskHold.count({
      where: {
        userId,
        status: { in: [RiskHoldStatus.HELD, RiskHoldStatus.REVIEW_REQUIRED] }
      }
    }),
    db.tenantMemberWalletProjection.findMany({
      where: { userId },
      select: {
        pendingFundingVnd: true,
        availableVnd: true,
        reservedVnd: true,
        recoveryVnd: true
      }
    }),
    db.tenantPayout.count({
      where: {
        userId,
        status: {
          in: [
            TenantPayoutStatus.RESERVED,
            TenantPayoutStatus.SUBMITTED,
            TenantPayoutStatus.PROCESSING,
            TenantPayoutStatus.UNKNOWN
          ]
        }
      }
    }),
    db.tenant.findUnique({
      where: { ownerUserId: userId },
      select: {
        treasury: {
          select: { availableVnd: true, reservedVnd: true }
        },
        _count: {
          select: {
            cashbackObligations: {
              where: {
                status: {
                  in: [
                    TenantObligationStatus.PENDING_FUNDING,
                    TenantObligationStatus.AVAILABLE,
                    TenantObligationStatus.RESERVED,
                    TenantObligationStatus.RECOVERY_REQUIRED
                  ]
                }
              }
            },
            payouts: {
              where: {
                status: {
                  in: [
                    TenantPayoutStatus.RESERVED,
                    TenantPayoutStatus.SUBMITTED,
                    TenantPayoutStatus.PROCESSING,
                    TenantPayoutStatus.UNKNOWN
                  ]
                }
              }
            }
          }
        }
      }
    })
  ]);

  const blockers: string[] = [];
  if (
    wallet &&
    (wallet.pendingVnd !== 0n || wallet.availableVnd !== 0n || wallet.reservedVnd !== 0n)
  ) {
    blockers.push("Ví còn số dư pending, available hoặc reserved.");
  }
  if (openConversions > 0) blockers.push("Còn conversion chưa kết thúc.");
  if (openPayouts > 0) blockers.push("Còn payout đang xử lý.");
  if (activeHolds > 0) blockers.push("Còn khoản cashback đang bị giữ để rà soát.");
  if (
    tenantWallets.some(
      (tenantWallet) =>
        tenantWallet.pendingFundingVnd !== 0n ||
        tenantWallet.availableVnd !== 0n ||
        tenantWallet.reservedVnd !== 0n ||
        tenantWallet.recoveryVnd !== 0n
    )
  ) {
    blockers.push("Ví tenant còn số dư hoặc nghĩa vụ recovery.");
  }
  if (openTenantPayouts > 0) blockers.push("Còn payout tenant đang xử lý.");
  if (
    ownedTenant?.treasury &&
    (ownedTenant.treasury.availableVnd !== 0n || ownedTenant.treasury.reservedVnd !== 0n)
  ) {
    blockers.push("Treasury của tenant còn số dư available hoặc reserved.");
  }
  if (ownedTenant && ownedTenant._count.cashbackObligations > 0) {
    blockers.push("Tenant còn nghĩa vụ cashback chưa kết thúc.");
  }
  if (ownedTenant && ownedTenant._count.payouts > 0) {
    blockers.push("Tenant còn payout hoặc rút treasury đang xử lý.");
  }
  return blockers;
}

export async function requestAccountDeletion(
  userId: string,
  reason?: string
): Promise<{ id: string; status: AccountDeletionStatus; blockedReason: string | null }> {
  const existing = await db.accountDeletionRequest.findFirst({
    where: {
      userId,
      status: {
        in: [
          AccountDeletionStatus.REQUESTED,
          AccountDeletionStatus.BLOCKED,
          AccountDeletionStatus.APPROVED,
          AccountDeletionStatus.EXECUTING
        ]
      }
    },
    orderBy: { requestedAt: "desc" }
  });
  if (existing) return existing;

  const blockers = await deletionBlockers(userId);
  const status =
    blockers.length > 0 ? AccountDeletionStatus.BLOCKED : AccountDeletionStatus.REQUESTED;
  return db.$transaction(async (tx) => {
    const request = await tx.accountDeletionRequest.create({
      data: {
        userId,
        status,
        reason: reason?.trim() || null,
        blockedReason: blockers.length > 0 ? blockers.join(" ") : null
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: "account_deletion.requested",
        entityType: "AccountDeletionRequest",
        entityId: request.id,
        after: { status, blockerCount: blockers.length }
      }
    });
    return request;
  });
}

export async function approveAccountDeletion(
  requestId: string,
  approverUserId: string
): Promise<void> {
  const request = await db.accountDeletionRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { user: { select: { id: true, clerkUserId: true } } }
  });
  if (
    request.status !== AccountDeletionStatus.REQUESTED &&
    request.status !== AccountDeletionStatus.BLOCKED
  ) {
    throw new AppError("CONFLICT", "Yêu cầu xóa không ở trạng thái có thể duyệt.", 409);
  }
  const blockers = await deletionBlockers(request.userId);
  if (blockers.length > 0) {
    await db.accountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: AccountDeletionStatus.BLOCKED,
        blockedReason: blockers.join(" ")
      }
    });
    throw new AppError("CONFLICT", blockers.join(" "), 409);
  }
  if (!request.user.clerkUserId) {
    throw new AppError("CONFLICT", "Tài khoản chưa liên kết Clerk.", 409);
  }

  await db.$transaction([
    db.accountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: AccountDeletionStatus.EXECUTING,
        approvedByUserId: approverUserId,
        approvedAt: new Date(),
        executedAt: new Date(),
        blockedReason: null,
        failureMessage: null
      }
    }),
    db.auditLog.create({
      data: {
        actorUserId: approverUserId,
        action: "account_deletion.approved",
        entityType: "AccountDeletionRequest",
        entityId: requestId,
        after: { userId: request.userId }
      }
    })
  ]);

  try {
    const client = await clerkClient();
    await client.users.deleteUser(request.user.clerkUserId);
  } catch (error) {
    await db.accountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: AccountDeletionStatus.FAILED,
        failureMessage: error instanceof Error ? error.message.slice(0, 500) : "Clerk delete failed"
      }
    });
    throw error;
  }
}

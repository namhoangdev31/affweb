import { PayoutMethod, PayoutSettlementStatus, Prisma } from "@/generated/prisma/client";
import { decryptSensitiveValue } from "@/lib/crypto";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";
import { assertTenantFinanceGate } from "@/modules/tenants/finance";
import { finalizeTenantPayoutSettlement } from "@/modules/tenants/payout";
import { canRequestReconciliation } from "@/modules/tenants/payout-policy";
import {
  type FinancialActorContext,
  revalidateFinancialActorContext
} from "@/modules/tenants/persona";

export type ManualUnknownResolution = "CONFIRMED_PAID" | "CONFIRMED_NOT_SENT" | "REMAIN_UNKNOWN";

function manualSystemContext(
  actor: FinancialActorContext,
  workerIdentity: string
): FinancialActorContext {
  return {
    actorUserId: null,
    actorRole: "SYSTEM_WORKER",
    workerIdentity,
    targetTenantId: actor.targetTenantId,
    targetUserId: actor.targetUserId,
    source: actor.source,
    requestId: actor.requestId,
    ipHash: actor.ipHash,
    userAgent: actor.userAgent
  };
}

async function authorizedManualActor(actorContext: FinancialActorContext, payoutId: string) {
  const actor = await revalidateFinancialActorContext(actorContext);
  if (!actor.actorUserId) {
    throw new AppError("AUTH_REQUIRED", "Yêu cầu tài khoản xác thực.", 401);
  }
  const payout = await db.tenantPayout.findUnique({
    where: { id: payoutId },
    include: { tenant: true }
  });
  if (!payout) throw new AppError("NOT_FOUND", "Payout ticket không tồn tại.", 404);
  if (
    !canRequestReconciliation({
      actorRole: actor.actorRole,
      actorTargetTenantId: actor.targetTenantId,
      payoutTenantId: payout.tenantId
    })
  ) {
    throw new AppError("FORBIDDEN", "Không có quyền xử lý manual payout này.", 403);
  }
  await requireRecentFinancePasskey(actor.actorUserId);
  await assertTenantFinanceGate(payout.tenant, "manual_payout");
  return { actor, payout };
}

export async function startManualPayout(actorContext: FinancialActorContext, payoutId: string) {
  const { actor, payout } = await authorizedManualActor(actorContext, payoutId);
  if (
    payout.approvalStatus !== "APPROVED" ||
    payout.settlementStatus !== "NOT_STARTED" ||
    payout.method !== PayoutMethod.MANUAL_BANK_TRANSFER ||
    payout.requiresManualReview
  ) {
    throw new AppError("PAYOUT_STATE", "Manual payout chưa đủ điều kiện bắt đầu.", 409);
  }
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TenantPayout" WHERE id = ${payout.id} FOR UPDATE`;
      const current = await tx.tenantPayout.findUniqueOrThrow({ where: { id: payout.id } });
      if (current.settlementStatus !== "NOT_STARTED") {
        throw new AppError("PAYOUT_STATE", "Manual payout đã được bắt đầu trước đó.", 409);
      }
      const updated = await tx.tenantPayout.update({
        where: { id: current.id },
        data: {
          settlementStatus: "PROCESSING",
          status: "PROCESSING",
          manualStartedByUserId: actor.actorUserId,
          manualStartedAt: new Date()
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.actorUserId,
          actorRole: actor.actorRole,
          targetTenantId: actor.targetTenantId,
          targetUserId: payout.userId,
          source: actor.source,
          requestId: actor.requestId,
          action: "tenant.payout.manual_started",
          entityType: "TenantPayout",
          entityId: payout.id,
          before: { settlementStatus: "NOT_STARTED" },
          after: { settlementStatus: "PROCESSING" }
        }
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function revealBeneficiaryForManualPayout(
  actorContext: FinancialActorContext,
  payoutId: string
) {
  const { actor, payout } = await authorizedManualActor(actorContext, payoutId);
  if (
    payout.method !== PayoutMethod.MANUAL_BANK_TRANSFER ||
    payout.approvalStatus !== "APPROVED" ||
    payout.settlementStatus !== "PROCESSING"
  ) {
    throw new AppError(
      "PAYOUT_STATE",
      "Beneficiary chỉ được mở trong manual transfer đang chạy.",
      409
    );
  }
  await db.auditLog.create({
    data: {
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      targetTenantId: actor.targetTenantId,
      targetUserId: payout.userId,
      source: actor.source,
      action: "tenant.payout.beneficiary_revealed",
      entityType: "TenantPayout",
      entityId: payout.id,
      requestId: actor.requestId,
      after: { bankBin: payout.bankBinSnapshot, accountLast4: payout.accountLast4Snapshot }
    }
  });
  return {
    payoutId: payout.id,
    bankBin: payout.bankBinSnapshot,
    accountLast4: payout.accountLast4Snapshot,
    accountNumber: decryptSensitiveValue(payout.accountNumberCipherSnapshot),
    accountName: decryptSensitiveValue(payout.accountNameCipherSnapshot)
  };
}

export async function completeManualPayout(
  actorContext: FinancialActorContext,
  params: {
    payoutId: string;
    transferReference: string;
    evidenceReference: string;
    note: string;
  }
) {
  const { actor, payout } = await authorizedManualActor(actorContext, params.payoutId);
  if (
    payout.method !== PayoutMethod.MANUAL_BANK_TRANSFER ||
    payout.settlementStatus !== "PROCESSING" ||
    !payout.manualStartedAt
  ) {
    throw new AppError("PAYOUT_STATE", "Manual payout chưa ở trạng thái có thể hoàn tất.", 409);
  }
  if (!params.transferReference.trim() || !params.evidenceReference.trim() || !params.note.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Hoàn tất manual payout cần mã giao dịch, evidence và ghi chú.",
      400
    );
  }
  return finalizeTenantPayoutSettlement(
    manualSystemContext(actor, "internal-manual-settlement"),
    payout.id,
    PayoutSettlementStatus.PAID,
    {
      manualCompletedByUserId: actor.actorUserId!,
      manualTransferReference: params.transferReference.trim(),
      manualEvidenceReference: params.evidenceReference.trim()
    }
  );
}

export async function markManualPayoutUnknown(
  actorContext: FinancialActorContext,
  params: { payoutId: string; evidenceReference: string; note: string }
) {
  const { actor, payout } = await authorizedManualActor(actorContext, params.payoutId);
  if (
    payout.method !== PayoutMethod.MANUAL_BANK_TRANSFER ||
    payout.settlementStatus !== "PROCESSING"
  ) {
    throw new AppError("PAYOUT_STATE", "Manual payout không ở PROCESSING.", 409);
  }
  if (!params.evidenceReference.trim() || !params.note.trim()) {
    throw new AppError("VALIDATION_ERROR", "UNKNOWN cần evidence và ghi chú.", 400);
  }
  return finalizeTenantPayoutSettlement(
    manualSystemContext(actor, "internal-manual-settlement"),
    payout.id,
    PayoutSettlementStatus.UNKNOWN,
    {
      failureCode: "MANUAL_TRANSFER_UNCERTAIN",
      failureMessage: params.note.trim(),
      manualCompletedByUserId: actor.actorUserId!,
      manualEvidenceReference: params.evidenceReference.trim()
    }
  );
}

export async function resolveManualPayoutUnknown(
  actorContext: FinancialActorContext,
  params: {
    payoutId: string;
    resolution: ManualUnknownResolution;
    evidenceReference?: string;
    note?: string;
  }
) {
  const { actor, payout } = await authorizedManualActor(actorContext, params.payoutId);
  if (
    payout.method !== PayoutMethod.MANUAL_BANK_TRANSFER ||
    payout.settlementStatus !== PayoutSettlementStatus.UNKNOWN
  ) {
    throw new AppError("PAYOUT_STATE", "Payout không phải manual UNKNOWN.", 409);
  }
  const evidenceReference = params.evidenceReference?.trim() ?? "";
  const note = params.note?.trim() ?? "";
  if (!evidenceReference || !note) {
    throw new AppError("VALIDATION_ERROR", "Resolution bắt buộc có evidence và lý do.", 400);
  }
  const env = loadServerEnv();
  if (
    params.resolution === "CONFIRMED_NOT_SENT" &&
    payout.manualStartedByUserId === actor.actorUserId &&
    payout.amountVnd > env.MANUAL_NO_SEND_SELF_CONFIRM_LIMIT_VND
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Two-eye policy: người bắt đầu transfer không được tự xác nhận NOT SENT.",
      403
    );
  }
  const nextSettlement =
    params.resolution === "CONFIRMED_PAID"
      ? PayoutSettlementStatus.PAID
      : params.resolution === "CONFIRMED_NOT_SENT"
        ? PayoutSettlementStatus.FAILED
        : PayoutSettlementStatus.UNKNOWN;
  return finalizeTenantPayoutSettlement(
    manualSystemContext(actor, "internal-manual-resolution"),
    payout.id,
    nextSettlement,
    {
      manualCompletedByUserId: actor.actorUserId!,
      ...(params.resolution === "CONFIRMED_PAID"
        ? { manualTransferReference: evidenceReference }
        : {}),
      manualEvidenceReference: evidenceReference,
      manualResolutionType: params.resolution,
      ...(params.resolution === "CONFIRMED_NOT_SENT"
        ? { failureCode: "MANUAL_CONFIRMED_NOT_SENT", failureMessage: note }
        : {})
    }
  );
}

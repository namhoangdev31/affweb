import "server-only";

import { randomUUID } from "node:crypto";
import { PayOS, type Payout } from "@payos/node";
import {
  ApprovalKind,
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  PayoutStatus,
  Prisma
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
import { postJournal } from "@/modules/ledger/service";
import { canTransitionPayout } from "@/modules/payout/state-machine";
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";
import { featureEnabled } from "@/modules/flags/service";

const DAILY_PAYOUT_LIMIT_VND = 500_000n;

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

function assertTransition(from: PayoutStatus, to: PayoutStatus): void {
  if (!canTransitionPayout(from, to)) {
    throw new AppError("PAYOUT_STATE", `Không thể chuyển payout từ ${from} sang ${to}.`, 409);
  }
}

function payosClient(): PayOS {
  const env = loadServerEnv();
  if (
    !env.PAYOS_PAYOUT_ENABLED ||
    !env.PAYOS_CLIENT_ID ||
    !env.PAYOS_API_KEY ||
    !env.PAYOS_CHECKSUM_KEY
  ) {
    throw new AppError("PAYOUT_DISABLED", "payOS Payout đang bị tắt.", 503);
  }
  return new PayOS({
    clientId: env.PAYOS_CLIENT_ID,
    apiKey: env.PAYOS_API_KEY,
    checksumKey: env.PAYOS_CHECKSUM_KEY,
    timeout: 20_000,
    maxRetries: 0
  });
}

export async function createPayoutTicket(input: {
  userId: string;
  beneficiaryId: string;
  amountVnd: bigint;
}) {
  if (input.amountVnd < MIN_PAYOUT_VND || input.amountVnd > BETA_MAX_PAYOUT_VND) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Payout beta phải từ ${MIN_PAYOUT_VND} đến ${BETA_MAX_PAYOUT_VND} VND.`,
      400
    );
  }
  const reference = `PO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "WalletProjection" WHERE "userId" = ${input.userId} FOR UPDATE
      `;
      const dayStart = startOfVietnamDay();
      const wallet = await tx.walletProjection.findUnique({ where: { userId: input.userId } });
      const beneficiary = await tx.bankBeneficiary.findFirst({
        where: {
          id: input.beneficiaryId,
          userId: input.userId,
          active: true,
          status: "VERIFIED"
        }
      });
      const lastChange = await tx.beneficiaryChange.findFirst({
        where: { beneficiaryId: input.beneficiaryId },
        orderBy: { createdAt: "desc" }
      });
      const spentToday = await tx.payoutTicket.aggregate({
        where: {
          userId: input.userId,
          createdAt: { gte: dayStart },
          status: { notIn: ["FAILED", "CANCELLED"] }
        },
        _sum: { amountVnd: true }
      });
      const systemSpentToday = await tx.payoutTicket.aggregate({
        where: {
          createdAt: { gte: dayStart },
          status: { notIn: ["FAILED", "CANCELLED"] }
        },
        _sum: { amountVnd: true }
      });
      const budgetFlag = await tx.featureFlag.findUnique({
        where: { key: "payout.daily_budget_vnd" },
        select: { value: true }
      });
      if (!wallet || wallet.availableVnd < input.amountVnd) {
        throw new AppError("INSUFFICIENT_BALANCE", "Số dư khả dụng không đủ.", 409);
      }
      if (!beneficiary) {
        throw new AppError("VALIDATION_ERROR", "Người thụ hưởng không hợp lệ.", 400);
      }
      if (!lastChange || lastChange.holdUntil > new Date()) {
        throw new AppError(
          "BENEFICIARY_HOLD",
          "Tài khoản ngân hàng đang trong thời gian khóa 72 giờ.",
          409
        );
      }
      if ((spentToday._sum.amountVnd ?? 0n) + input.amountVnd > DAILY_PAYOUT_LIMIT_VND) {
        throw new AppError("PAYOUT_LIMIT", "Đã vượt hạn mức payout trong ngày.", 409);
      }
      if (
        (systemSpentToday._sum.amountVnd ?? 0n) + input.amountVnd >
        systemDailyBudget(budgetFlag?.value)
      ) {
        throw new AppError("PAYOUT_LIMIT", "Ngân sách payout toàn hệ thống hôm nay đã hết.", 409);
      }

      const draft = await tx.payoutTicket.create({
        data: {
          reference,
          userId: input.userId,
          beneficiaryId: beneficiary.id,
          amountVnd: input.amountVnd,
          status: PayoutStatus.DRAFT
        }
      });
      assertTransition(draft.status, PayoutStatus.RESERVED);
      await postJournal(tx, {
        type: LedgerTransactionType.PAYOUT_RESERVE,
        idempotencyKey: `payout:${draft.id}:reserve`,
        description: "Khóa số dư cho yêu cầu hoàn tiền.",
        reference: draft.id,
        lines: [
          {
            accountCode: `liability:user:${input.userId}:available`,
            accountName: "User available cashback",
            accountKind: LedgerAccountKind.LIABILITY,
            userId: input.userId,
            direction: LedgerDirection.DEBIT,
            amountVnd: input.amountVnd
          },
          {
            accountCode: `liability:user:${input.userId}:reserved`,
            accountName: "User reserved cashback",
            accountKind: LedgerAccountKind.LIABILITY,
            userId: input.userId,
            direction: LedgerDirection.CREDIT,
            amountVnd: input.amountVnd
          }
        ]
      });
      await tx.walletProjection.update({
        where: { userId: input.userId },
        data: {
          availableVnd: { decrement: input.amountVnd },
          reservedVnd: { increment: input.amountVnd },
          version: { increment: 1 }
        }
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: "PayoutTicket",
          aggregateId: draft.id,
          eventType: "payout.reserved",
          idempotencyKey: `payout:${draft.id}:reserved:event`,
          payload: { payoutTicketId: draft.id }
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: input.userId,
          action: "payout.created",
          entityType: "PayoutTicket",
          entityId: draft.id,
          after: { amountVnd: input.amountVnd.toString(), status: PayoutStatus.RESERVED }
        }
      });
      return tx.payoutTicket.update({
        where: { id: draft.id },
        data: { status: PayoutStatus.RESERVED }
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function reviewPayout(input: {
  payoutTicketId: string;
  reviewerUserId: string;
  comment?: string;
}) {
  await requireRecentFinancePasskey(input.reviewerUserId);
  return db.$transaction(async (tx) => {
    const ticket = await tx.payoutTicket.findUniqueOrThrow({
      where: { id: input.payoutTicketId }
    });
    if (ticket.userId === input.reviewerUserId) {
      throw new AppError("SEPARATION_OF_DUTIES", "Người tạo payout không được tự review.", 409);
    }
    assertTransition(ticket.status, PayoutStatus.REVIEWED);
    await tx.payoutApproval.create({
      data: {
        payoutTicketId: ticket.id,
        actorUserId: input.reviewerUserId,
        kind: ApprovalKind.REVIEW,
        comment: input.comment ?? null
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.reviewerUserId,
        action: "payout.reviewed",
        entityType: "PayoutTicket",
        entityId: ticket.id,
        before: { status: ticket.status },
        after: { status: PayoutStatus.REVIEWED }
      }
    });
    return tx.payoutTicket.update({
      where: { id: ticket.id },
      data: { status: PayoutStatus.REVIEWED }
    });
  });
}

export async function approvePayout(input: {
  payoutTicketId: string;
  approverUserId: string;
  comment?: string;
}) {
  await requireRecentFinancePasskey(input.approverUserId);
  return db.$transaction(async (tx) => {
    const ticket = await tx.payoutTicket.findUniqueOrThrow({
      where: { id: input.payoutTicketId },
      include: { approvals: true }
    });
    assertTransition(ticket.status, PayoutStatus.APPROVED);
    const reviewer = ticket.approvals.find((approval) => approval.kind === ApprovalKind.REVIEW);
    if (
      !reviewer ||
      reviewer.actorUserId === input.approverUserId ||
      ticket.userId === input.approverUserId
    ) {
      throw new AppError(
        "SEPARATION_OF_DUTIES",
        "Reviewer và approver phải là hai tài khoản khác nhau.",
        409
      );
    }
    await tx.payoutApproval.create({
      data: {
        payoutTicketId: ticket.id,
        actorUserId: input.approverUserId,
        kind: ApprovalKind.APPROVE,
        comment: input.comment ?? null
      }
    });
    await tx.outboxEvent.create({
      data: {
        aggregateType: "PayoutTicket",
        aggregateId: ticket.id,
        eventType: "payout.approved",
        idempotencyKey: `payout:${ticket.id}:approved:event`,
        payload: { payoutTicketId: ticket.id }
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.approverUserId,
        action: "payout.approved",
        entityType: "PayoutTicket",
        entityId: ticket.id,
        before: { status: ticket.status },
        after: { status: PayoutStatus.APPROVED }
      }
    });
    return tx.payoutTicket.update({
      where: { id: ticket.id },
      data: { status: PayoutStatus.APPROVED }
    });
  });
}

function mapPayosState(payout: Payout): PayoutStatus {
  const transactionStates = payout.transactions.map((transaction) => transaction.state);
  if (
    ["COMPLETED", "PARTIAL_COMPLETED"].includes(payout.approvalState) &&
    transactionStates.length > 0 &&
    transactionStates.every((state) => state === "SUCCEEDED")
  ) {
    return PayoutStatus.PAID;
  }
  if (
    ["FAILED", "REJECTED", "CANCELLED"].includes(payout.approvalState) ||
    (transactionStates.length > 0 &&
      transactionStates.every((state) => ["FAILED", "REVERSED", "CANCELLED"].includes(state)))
  ) {
    return PayoutStatus.FAILED;
  }
  return ["PROCESSING", "APPROVED", "SCHEDULED", "PARTIAL_COMPLETED"].includes(
    payout.approvalState
  ) || transactionStates.some((state) => ["PROCESSING", "ON_HOLD"].includes(state))
    ? PayoutStatus.PROCESSING
    : PayoutStatus.SUBMITTED;
}

async function applyTerminalPayoutOutcome(
  tx: Prisma.TransactionClient,
  ticket: { id: string; userId: string; amountVnd: bigint; status: PayoutStatus },
  nextStatus: PayoutStatus
): Promise<void> {
  if (
    ticket.status === PayoutStatus.PAID ||
    ticket.status === PayoutStatus.FAILED ||
    (nextStatus !== PayoutStatus.PAID && nextStatus !== PayoutStatus.FAILED)
  ) {
    return;
  }
  if (nextStatus === PayoutStatus.PAID) {
    await postJournal(tx, {
      type: LedgerTransactionType.PAYOUT_PAID,
      idempotencyKey: `payout:${ticket.id}:paid`,
      description: "payOS xác nhận payout thành công.",
      reference: ticket.id,
      lines: [
        {
          accountCode: `liability:user:${ticket.userId}:reserved`,
          accountName: "User reserved cashback",
          accountKind: LedgerAccountKind.LIABILITY,
          userId: ticket.userId,
          direction: LedgerDirection.DEBIT,
          amountVnd: ticket.amountVnd
        },
        {
          accountCode: "asset:cash",
          accountName: "Cash",
          accountKind: LedgerAccountKind.ASSET,
          direction: LedgerDirection.CREDIT,
          amountVnd: ticket.amountVnd
        }
      ]
    });
    await tx.walletProjection.update({
      where: { userId: ticket.userId },
      data: {
        reservedVnd: { decrement: ticket.amountVnd },
        paidVnd: { increment: ticket.amountVnd },
        version: { increment: 1 }
      }
    });
  } else {
    await postJournal(tx, {
      type: LedgerTransactionType.PAYOUT_RELEASE,
      idempotencyKey: `payout:${ticket.id}:release`,
      description: "Giải phóng số dư sau khi payOS xác nhận payout thất bại.",
      reference: ticket.id,
      lines: [
        {
          accountCode: `liability:user:${ticket.userId}:reserved`,
          accountName: "User reserved cashback",
          accountKind: LedgerAccountKind.LIABILITY,
          userId: ticket.userId,
          direction: LedgerDirection.DEBIT,
          amountVnd: ticket.amountVnd
        },
        {
          accountCode: `liability:user:${ticket.userId}:available`,
          accountName: "User available cashback",
          accountKind: LedgerAccountKind.LIABILITY,
          userId: ticket.userId,
          direction: LedgerDirection.CREDIT,
          amountVnd: ticket.amountVnd
        }
      ]
    });
    await tx.walletProjection.update({
      where: { userId: ticket.userId },
      data: {
        reservedVnd: { decrement: ticket.amountVnd },
        availableVnd: { increment: ticket.amountVnd },
        version: { increment: 1 }
      }
    });
  }
  await tx.outboxEvent.upsert({
    where: { idempotencyKey: `payout:${ticket.id}:${nextStatus.toLowerCase()}:event` },
    create: {
      aggregateType: "PayoutTicket",
      aggregateId: ticket.id,
      eventType: `payout.${nextStatus.toLowerCase()}`,
      idempotencyKey: `payout:${ticket.id}:${nextStatus.toLowerCase()}:event`,
      payload: { payoutTicketId: ticket.id }
    },
    update: {}
  });
}

export async function submitPayout(payoutTicketId: string, actorUserId: string) {
  await requireRecentFinancePasskey(actorUserId);
  if (!(await featureEnabled("payout.enabled", false))) {
    throw new AppError("PAYOUT_DISABLED", "Payout kill switch đang tắt.", 503);
  }
  const client = payosClient();
  const ticket = await db.payoutTicket.findUnique({
    where: { id: payoutTicketId },
    include: { beneficiary: true, attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } }
  });
  if (!ticket) throw new AppError("NOT_FOUND", "Payout ticket không tồn tại.", 404);
  if (ticket.status !== PayoutStatus.APPROVED) {
    throw new AppError("PAYOUT_STATE", "Payout chưa được duyệt.", 409);
  }
  const destination = decryptSensitiveValue(ticket.beneficiary.accountNumberCipher);
  const attempt = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PayoutTicket" WHERE id = ${ticket.id} FOR UPDATE`;
      const current = await tx.payoutTicket.findUniqueOrThrow({
        where: { id: ticket.id },
        include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } }
      });
      assertTransition(current.status, PayoutStatus.SUBMITTED);
      const attemptNumber = (current.attempts[0]?.attemptNumber ?? 0) + 1;
      const idempotencyKey = `payout:${ticket.id}:attempt:${attemptNumber}`;
      const created = await tx.payoutAttempt.create({
        data: { payoutTicketId: ticket.id, attemptNumber, idempotencyKey }
      });
      await tx.payoutTicket.update({
        where: { id: ticket.id },
        data: { status: PayoutStatus.SUBMITTED, submittedAt: new Date() }
      });
      return created;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  const submittedTicket = { ...ticket, status: PayoutStatus.SUBMITTED };
  try {
    const payout = await client.payouts.batch.create(
      {
        referenceId: ticket.reference,
        validateDestination: true,
        category: ["AFFILIATE_CASHBACK"],
        payouts: [
          {
            referenceId: ticket.reference,
            amount: Number(ticket.amountVnd),
            description: `Cashback ${ticket.reference}`.slice(0, 100),
            toBin: ticket.beneficiary.bankBin,
            toAccountNumber: destination
          }
        ]
      },
      attempt.idempotencyKey
    );
    const status = mapPayosState(payout);
    return await db.$transaction(async (tx) => {
      await tx.payoutAttempt.update({
        where: { id: attempt.id },
        data: {
          providerPayoutId: payout.id,
          providerState: payout.approvalState,
          submittedAt: new Date()
        }
      });
      if (status !== PayoutStatus.SUBMITTED) {
        assertTransition(PayoutStatus.SUBMITTED, status);
      }
      await applyTerminalPayoutOutcome(tx, submittedTicket, status);
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "payout.submitted",
          entityType: "PayoutTicket",
          entityId: ticket.id,
          before: { status: PayoutStatus.SUBMITTED },
          after: { status, providerPayoutId: payout.id }
        }
      });
      return tx.payoutTicket.update({
        where: { id: ticket.id },
        data: { status }
      });
    });
  } catch (error) {
    const failureMessage =
      error instanceof Error ? error.message.slice(0, 500) : "Unknown payOS error";
    await db.$transaction([
      db.payoutAttempt.update({
        where: { id: attempt.id },
        data: { providerState: "UNKNOWN", reconciledAt: null }
      }),
      db.payoutTicket.update({
        where: { id: ticket.id },
        data: {
          status: PayoutStatus.UNKNOWN,
          failureCode: "PAYOS_UNCERTAIN",
          failureMessage
        }
      }),
      db.auditLog.create({
        data: {
          actorUserId,
          action: "payout.unknown",
          entityType: "PayoutTicket",
          entityId: ticket.id,
          before: { status: PayoutStatus.SUBMITTED },
          after: { status: PayoutStatus.UNKNOWN, failureCode: "PAYOS_UNCERTAIN" }
        }
      })
    ]);
    throw new AppError(
      "PAYOUT_UNKNOWN",
      "Trạng thái payOS chưa xác định; hệ thống sẽ đối soát trước khi thử lại.",
      502
    );
  }
}

export async function reconcilePayout(payoutTicketId: string) {
  const ticket = await db.payoutTicket.findUnique({
    where: { id: payoutTicketId },
    include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } }
  });
  const attempt = ticket?.attempts[0];
  if (!ticket || !attempt) {
    throw new AppError("PAYOUT_STATE", "Không có payOS payout để đối soát.", 409);
  }
  const client = payosClient();
  let payout: Payout | undefined;
  if (attempt.providerPayoutId) {
    payout = await client.payouts.get(attempt.providerPayoutId);
  } else {
    const page = await client.payouts.list({ referenceId: ticket.reference, limit: 10 });
    payout = page.data.find((candidate) => candidate.referenceId === ticket.reference);
  }
  if (!payout) {
    throw new AppError(
      "PAYOUT_UNKNOWN",
      "payOS chưa trả về payout theo referenceId; không được retry gửi tiền.",
      409
    );
  }
  const resolvedPayout = payout;
  const mappedStatus = mapPayosState(resolvedPayout);
  const nextStatus =
    ticket.status === PayoutStatus.UNKNOWN && mappedStatus === PayoutStatus.SUBMITTED
      ? PayoutStatus.PROCESSING
      : mappedStatus;
  if (nextStatus !== ticket.status) assertTransition(ticket.status, nextStatus);
  return db.$transaction(async (tx) => {
    await tx.payoutAttempt.update({
      where: { id: attempt.id },
      data: {
        providerPayoutId: resolvedPayout.id,
        providerState: resolvedPayout.approvalState,
        reconciledAt: new Date()
      }
    });
    await applyTerminalPayoutOutcome(tx, ticket, nextStatus);
    return tx.payoutTicket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        paidAt: nextStatus === PayoutStatus.PAID ? new Date() : ticket.paidAt
      }
    });
  });
}

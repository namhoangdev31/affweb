import "server-only";

import { AppError } from "@/lib/errors";

function legacyPayoutDisabled(): never {
  throw new AppError(
    "CONNECTOR_DISABLED",
    "Core payout workflow đã bị đóng tại hierarchical-finance cutover; record cũ chỉ được inventory và resolve qua tenant finance.",
    410
  );
}

export async function createPayoutTicket(_input: {
  userId: string;
  beneficiaryId: string;
  amountVnd: bigint;
  idempotencyKey: string;
  requestHash: string;
}): Promise<never> {
  void _input;
  return legacyPayoutDisabled();
}

export async function reviewPayout(_input: {
  payoutTicketId: string;
  reviewerUserId: string;
  comment?: string;
}): Promise<never> {
  void _input;
  return legacyPayoutDisabled();
}

export async function approvePayout(_input: {
  payoutTicketId: string;
  approverUserId: string;
  reason: string;
}): Promise<never> {
  void _input;
  return legacyPayoutDisabled();
}

export async function submitPayout(_payoutTicketId: string, _actorUserId: string): Promise<never> {
  void _payoutTicketId;
  void _actorUserId;
  return legacyPayoutDisabled();
}

export async function reconcilePayout(_payoutTicketId: string): Promise<never> {
  void _payoutTicketId;
  return legacyPayoutDisabled();
}

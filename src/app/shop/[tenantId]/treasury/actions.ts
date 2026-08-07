"use server";

import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import {
  createTenantFundingOrder,
  transferMasterWalletToTreasury
} from "@/modules/tenants/finance";
import { requestTreasuryWithdrawal } from "@/modules/tenants/payout";
import {
  requireTenantMasterContext,
  resolveFinancialActorContext
} from "@/modules/tenants/persona";

const fundingSchema = z.object({
  amountVnd: z.coerce.bigint().positive(),
  idempotencyKey: z.string().optional()
});

export async function createTenantFundingOrderAction(rawInput: unknown) {
  const user = await requireUser();
  const limit = await rateLimit(`tenant-funding:${user.id}`, 5, 3600);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Bạn đã tạo quá nhiều funding order.", 429);
  }

  const input = fundingSchema.parse(rawInput);
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();

  const order = await createTenantFundingOrder({
    actorUserId: user.id,
    amountVnd: input.amountVnd,
    idempotencyKey,
    requestHash: crypto.randomUUID(),
    baseUrl: loadServerEnv().APP_BASE_URL
  });

  return jsonSafe({ order });
}

export async function transferMasterWalletToTreasuryAction(rawInput: unknown) {
  const user = await requireUser();
  const limit = await rateLimit(`tenant-treasury-transfer:${user.id}`, 10, 3600);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Bạn đã thực hiện quá nhiều giao dịch chuyển ví.", 429);
  }

  const input = fundingSchema.parse(rawInput);
  await requireTenantMasterContext(user.id);
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();

  const transfer = await transferMasterWalletToTreasury({
    actorUserId: user.id,
    amountVnd: input.amountVnd,
    idempotencyKey,
    requestHash: crypto.randomUUID()
  });

  return jsonSafe({ transfer });
}

const withdrawalSchema = z.object({
  beneficiaryId: z.string().cuid(),
  amountVnd: z.coerce.bigint().positive(),
  idempotencyKey: z.string().optional()
});

export async function requestTreasuryWithdrawalAction(rawInput: unknown) {
  const user = await requireUser();
  const limit = await rateLimit(`tenant-treasury-withdrawal:${user.id}`, 3, 3600);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Bạn đã tạo quá nhiều yêu cầu rút quỹ.", 429);
  }

  const input = withdrawalSchema.parse(rawInput);
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();

  const tenantContext = await requireTenantMasterContext(user.id);
  const targetTenant = tenantContext.ownedTenant ?? tenantContext.masterTenant;
  const actor = await resolveFinancialActorContext({
    actorUserId: user.id,
    targetTenantId: targetTenant.id,
    source: "HTTP",
    requestId: crypto.randomUUID()
  });

  const payout = await requestTreasuryWithdrawal(
    actor,
    input.amountVnd,
    idempotencyKey,
    input.beneficiaryId
  );

  return jsonSafe({ payout });
}

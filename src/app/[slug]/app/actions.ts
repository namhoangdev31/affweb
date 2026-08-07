"use server";

import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import { requestMemberWithdrawal } from "@/modules/tenants/payout";
import { resolveFinancialActorContext, resolveTenantContext } from "@/modules/tenants/persona";

const payoutSchema = z.object({
  beneficiaryId: z.string().cuid(),
  amountVnd: z.coerce.bigint().positive(),
  idempotencyKey: z.string().optional()
});

export async function requestMemberWithdrawalAction(rawInput: unknown) {
  const user = await requireUser();
  const limit = await rateLimit(`tenant-member-payout:${user.id}`, 3, 3600);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Bạn đã tạo quá nhiều yêu cầu rút tiền.", 429);
  }

  const input = payoutSchema.parse(rawInput);
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();

  const tenantContext = await resolveTenantContext(user.id);
  const targetTenant = tenantContext.memberTenant ?? tenantContext.masterTenant;
  const actor = await resolveFinancialActorContext({
    actorUserId: user.id,
    targetTenantId: targetTenant.id,
    source: "HTTP",
    requestId: crypto.randomUUID()
  });

  const payout = await requestMemberWithdrawal(
    actor,
    input.amountVnd,
    idempotencyKey,
    input.beneficiaryId
  );

  return jsonSafe({ payout });
}

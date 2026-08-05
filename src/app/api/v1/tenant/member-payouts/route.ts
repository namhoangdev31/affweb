import { z } from "zod";
import { requireApiRecentUser } from "@/lib/authz";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import {
  assertTrustedOrigin,
  readJson,
  requestPayloadHash,
  requireIdempotencyKey
} from "@/lib/request";
import { requestMemberWithdrawal } from "@/modules/tenants/payout";
import { resolveFinancialActorContext, resolveTenantContext } from "@/modules/tenants/persona";

export const runtime = "nodejs";
const schema = z.object({
  beneficiaryId: z.string().cuid(),
  amountVnd: z.coerce.bigint().positive()
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiRecentUser();
    const limit = await rateLimit(`tenant-member-payout:${user.id}`, 3, 3600);
    if (!limit.allowed) {
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "Bạn đã tạo quá nhiều yêu cầu rút tiền." } },
        { status: 429 }
      );
    }
    const input = schema.parse(await readJson(request));
    requestPayloadHash(input);
    const tenantContext = await resolveTenantContext(user.id);
    const targetTenant = tenantContext.memberTenant ?? tenantContext.masterTenant;
    const actor = await resolveFinancialActorContext({
      actorUserId: user.id,
      targetTenantId: targetTenant.id,
      source: "HTTP",
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID()
    });
    const payout = await requestMemberWithdrawal(
      actor,
      input.amountVnd,
      requireIdempotencyKey(request),
      input.beneficiaryId
    );
    return Response.json(jsonSafe({ payout }), {
      status: 201,
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

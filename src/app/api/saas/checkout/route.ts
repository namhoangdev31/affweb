import { z } from "zod";
import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError, errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import {
  assertTrustedOrigin,
  readJson,
  requestId,
  requestPayloadHash,
  requireIdempotencyKey
} from "@/lib/request";
import { createTenantCheckoutSession } from "@/lib/tenant";

export const runtime = "nodejs";

const inputSchema = z.object({
  tenantId: z.string().cuid(),
  planCode: z.enum([
    "STARTER_99K",
    "STARTER_YEARLY",
    "PRO_199K",
    "PRO_YEARLY",
    "PREMIUM_399K",
    "PREMIUM_YEARLY"
  ])
});

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const input = inputSchema.parse(await readJson(request));
    const idempotencyKey = requireIdempotencyKey(request);
    const limit = await rateLimit(`saas-checkout:${user.id}`, 10, 3600);
    if (!limit.allowed) {
      throw new AppError("RATE_LIMITED", "Bạn đã tạo quá nhiều yêu cầu thanh toán.", 429);
    }
    const ownedTenant = await db.tenant.findFirst({
      where: { id: input.tenantId, ownerUserId: user.id },
      select: { id: true }
    });
    if (!ownedTenant) {
      throw new AppError("FORBIDDEN", "Bạn không sở hữu nhóm này.", 403);
    }

    const session = await createTenantCheckoutSession({
      tenantId: input.tenantId,
      planCode: input.planCode,
      baseUrl: loadServerEnv().APP_BASE_URL,
      idempotencyKey,
      requestHash: requestPayloadHash(input)
    });

    return Response.json(jsonSafe({ success: true, data: session }), {
      headers: { "Cache-Control": "no-store", "X-Request-Id": id }
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}

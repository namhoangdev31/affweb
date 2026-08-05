import { z } from "zod";
import { requireApiRecentUser } from "@/lib/authz";
import { loadServerEnv } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import {
  assertTrustedOrigin,
  readJson,
  requestPayloadHash,
  requireIdempotencyKey
} from "@/lib/request";
import { createTenantFundingOrder } from "@/modules/tenants/finance";

export const runtime = "nodejs";

const schema = z.object({ amountVnd: z.coerce.bigint().positive() });

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiRecentUser();
    const limit = await rateLimit(`tenant-funding:${user.id}`, 5, 3600);
    if (!limit.allowed) {
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "Bạn đã tạo quá nhiều funding order." } },
        { status: 429 }
      );
    }
    const input = schema.parse(await readJson(request));
    const order = await createTenantFundingOrder({
      actorUserId: user.id,
      amountVnd: input.amountVnd,
      idempotencyKey: requireIdempotencyKey(request),
      requestHash: requestPayloadHash(input),
      baseUrl: loadServerEnv().APP_BASE_URL
    });
    return Response.json(jsonSafe({ order }), {
      status: 201,
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

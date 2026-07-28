import { z } from "zod";
import { requireApiUser } from "@/lib/authz";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import {
  assertTrustedOrigin,
  readJson,
  requestId,
  requestPayloadHash,
  requireIdempotencyKey
} from "@/lib/request";
import { createAffiliateLink } from "@/modules/links/service";

export const runtime = "nodejs";

const inputSchema = z.object({
  url: z.url(),
  campaignId: z.string().cuid().optional(),
  affiliateAccountId: z.string().cuid().optional(),
  provider: z.enum(["SHOPEE_DIRECT", "LAZADA_OPEN_API", "ACCESSTRADE_API"]).optional()
});

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const limit = await rateLimit(`links:${user.id}`, 20, 60);
    if (!limit.allowed) {
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "Bạn tạo link quá nhanh.", requestId: id } },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) }
        }
      );
    }
    const input = inputSchema.parse(await readJson(request));
    const clientIdempotencyKey = requireIdempotencyKey(request);
    const result = await createAffiliateLink({
      userId: user.id,
      ...input,
      clientIdempotencyKey,
      requestHash: requestPayloadHash(input)
    });
    return Response.json(jsonSafe(result), {
      status: 201,
      headers: { "Cache-Control": "no-store", "X-Request-Id": id }
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}

import { z } from "zod";
import { Role } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/authz";
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
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";
import { featureEnabled } from "@/modules/flags/service";
import { createFinanceSettlementBatch } from "@/modules/settlement/service";

export const runtime = "nodejs";

const amountSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const inputSchema = z.object({
  affiliateAccountId: z.string().cuid(),
  externalReference: z.string().trim().min(1).max(200),
  totalAmountVnd: amountSchema,
  reason: z.string().trim().min(10).max(500),
  lines: z
    .array(
      z.object({
        externalOrderId: z.string().trim().min(1).max(200),
        externalItemKey: z.string().trim().min(1).max(200),
        amountVnd: amountSchema
      })
    )
    .min(1)
    .max(2_000),
  evidence: z.unknown()
});

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const actor = await requireApiRole([
      Role.FINANCE_REVIEWER,
      Role.FINANCE_APPROVER,
      Role.SUPER_ADMIN
    ]);
    await requireRecentFinancePasskey(actor.id);
    if (!(await featureEnabled("cashback.release.enabled", false))) {
      throw new AppError("CONNECTOR_DISABLED", "Settlement release đang được tắt.", 503);
    }
    const limit = await rateLimit(`finance-settlement:${actor.id}`, 10, 60);
    if (!limit.allowed) {
      return Response.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Bạn tạo settlement batch quá nhanh.",
            requestId: id
          }
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    const body = inputSchema.parse(await readJson(request, 1_048_576));
    const batch = await createFinanceSettlementBatch({
      actorUserId: actor.id,
      idempotencyKey: requireIdempotencyKey(request),
      requestHash: requestPayloadHash(body),
      settlement: body
    });
    return Response.json(jsonSafe({ data: batch }), {
      status: 201,
      headers: { "Cache-Control": "no-store", "X-Request-Id": id }
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}

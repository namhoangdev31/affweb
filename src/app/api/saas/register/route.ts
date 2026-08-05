import { z } from "zod";
import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, readJson, requestId } from "@/lib/request";
import { registerTenantWithTrial } from "@/lib/tenant";

export const runtime = "nodejs";

const inputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  shopeeAffiliateId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/),
  memberSharePercent: z.number().int().min(1).max(100)
});

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const input = inputSchema.parse(await readJson(request));
    const existing = await db.tenant.findUnique({
      where: { ownerUserId: user.id },
      select: { id: true }
    });
    if (existing) {
      return Response.json(
        {
          error: {
            code: "CONFLICT",
            message: "Bạn đã sở hữu một nhóm.",
            requestId: id
          }
        },
        { status: 409 }
      );
    }

    const tenant = await db.$transaction(async (tx) => {
      const created = await registerTenantWithTrial(
        {
          name: input.name,
          slug: input.slug,
          ownerUserId: user.id,
          shopeeAffiliateId: input.shopeeAffiliateId,
          memberShareBps: input.memberSharePercent * 100
        },
        tx
      );
      return created;
    });

    return Response.json(
      {
        success: true,
        message: "Tạo nhóm dùng thử 14 ngày thành công.",
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name }
      },
      { status: 201, headers: { "Cache-Control": "no-store", "X-Request-Id": id } }
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

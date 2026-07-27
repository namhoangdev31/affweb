import { z } from "zod";
import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, readJson, requestId } from "@/lib/request";

export const runtime = "nodejs";

const inputSchema = z.object({
  shopeeAffiliateId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/),
  memberSharePercent: z.number().int().min(1).max(100)
});

export async function PUT(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const input = inputSchema.parse(await readJson(request));
    const current = await db.tenant.findUnique({
      where: { ownerUserId: user.id },
      select: {
        id: true,
        shopeeAffiliateId: true,
        memberShareBps: true
      }
    });
    if (!current) {
      throw new AppError("FORBIDDEN", "Bạn không sở hữu nhóm này.", 403);
    }

    const updated = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: current.id },
        data: {
          shopeeAffiliateId: input.shopeeAffiliateId,
          memberShareBps: input.memberSharePercent * 100
        },
        select: {
          id: true,
          shopeeAffiliateId: true,
          memberShareBps: true
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "tenant.affiliate_settings.updated",
          entityType: "Tenant",
          entityId: current.id,
          before: {
            affiliateIdChanged: current.shopeeAffiliateId !== input.shopeeAffiliateId,
            memberShareBps: current.memberShareBps
          },
          after: {
            affiliateIdChanged: current.shopeeAffiliateId !== input.shopeeAffiliateId,
            memberShareBps: tenant.memberShareBps
          }
        }
      });
      return tenant;
    });

    return Response.json(
      {
        tenant: {
          shopeeAffiliateId: updated.shopeeAffiliateId,
          memberSharePercent: (updated.memberShareBps ?? 0) / 100
        }
      },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": id } }
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

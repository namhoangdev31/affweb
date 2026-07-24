import { db } from "@/lib/db";
import { stableHash } from "@/lib/crypto";
import { errorResponse } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { verifyQStashRequest } from "@/modules/jobs/qstash";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  try {
    await verifyQStashRequest(request, body);
    const incidentId = stableHash(body);
    const admins = await db.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { not: "USER" } } }
      },
      select: { id: true }
    });
    await db.$transaction([
      db.auditLog.create({
        data: {
          action: "qstash.delivery_exhausted",
          entityType: "QStashFailure",
          entityId: incidentId,
          metadata: {
            bodySha256: incidentId,
            bytes: Buffer.byteLength(body)
          }
        }
      }),
      ...(admins.length
        ? [
            db.notification.createMany({
              data: admins.map((admin) => ({
                userId: admin.id,
                type: "operations.qstash_failure",
                title: "QStash job đã hết lượt retry",
                body: "Một tác vụ nền cần được kiểm tra trong bảng vận hành. Payload không được đưa vào thông báo.",
                deepLink: "/admin/reconciliation"
              }))
            })
          ]
        : [])
    ]);
    logger.error("qstash_delivery_exhausted", {
      incidentId,
      bytes: Buffer.byteLength(body)
    });
    return Response.json({ ok: true, incidentId });
  } catch (error) {
    return errorResponse(error);
  }
}

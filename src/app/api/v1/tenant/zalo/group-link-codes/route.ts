import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestId } from "@/lib/request";
import { createZaloBindingCode } from "@/lib/zalo";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const limit = await rateLimit(`zalo-binding:${user.id}`, 5, 3600);
    if (!limit.allowed) {
      throw new AppError("RATE_LIMITED", "Bạn đã tạo quá nhiều mã liên kết.", 429);
    }
    const tenant = await db.tenant.findUnique({
      where: { ownerUserId: user.id },
      select: { id: true }
    });
    if (!tenant) throw new AppError("FORBIDDEN", "Bạn không sở hữu tenant.", 403);
    const result = await createZaloBindingCode({
      tenantId: tenant.id,
      ownerUserId: user.id
    });
    return Response.json(
      {
        code: result.code,
        expiresAt: result.expiresAt.toISOString(),
        inviteUrl: loadServerEnv().NEXT_PUBLIC_ZALO_BOT_GROUP_INVITE_URL
      },
      { headers: { "Cache-Control": "private, no-store", "X-Request-Id": id } }
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

import { requireApiUser } from "@/lib/authz";
import { AppError, errorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestId } from "@/lib/request";
import { createZaloUserBindingToken } from "@/lib/zalo";
import { resolveTenantContext } from "@/modules/tenants/persona";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const tenantContext = await resolveTenantContext(user.id);
    const tenant = tenantContext.memberTenant;
    if (!tenant) throw new AppError("FORBIDDEN", "Tài khoản chưa thuộc tenant user.", 403);
    const limit = await rateLimit(`zalo-user-binding:${tenant.id}:${user.id}`, 5, 3600);
    if (!limit.allowed) throw new AppError("RATE_LIMITED", "Bạn đã tạo quá nhiều mã.", 429);
    const token = await createZaloUserBindingToken({ tenantId: tenant.id, userId: user.id });
    return Response.json(
      {
        command: `/bind ${token.token}`,
        expiresAt: token.expiresAt.toISOString()
      },
      { headers: { "Cache-Control": "private, no-store", "X-Request-Id": id } }
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

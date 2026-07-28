import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError, errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, requestId } from "@/lib/request";
import { featureEnabled } from "@/modules/flags/service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const tenant = await db.tenant.findUnique({
      where: { ownerUserId: user.id },
      select: { id: true }
    });
    if (!tenant) throw new AppError("FORBIDDEN", "Bạn không sở hữu tenant.", 403);
    if (
      !loadServerEnv().TENANT_IMPORT_ENABLED ||
      !(await featureEnabled("tenant.conversion_import.enabled", false))
    ) {
      throw new AppError("CONNECTOR_DISABLED", "Import conversion tenant đang tạm dừng.", 503);
    }
    throw new AppError(
      "CONNECTOR_UNAVAILABLE",
      "Chưa cài contract CSV Shopee đã được xác minh; không được suy đoán schema report.",
      503
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

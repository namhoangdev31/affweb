import { Role } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/authz";
import { AppError, errorResponse } from "@/lib/errors";
import { requestId } from "@/lib/request";
import { revealBeneficiaryForManualPayout } from "@/modules/tenants/manual";
import { resolveFinancialActorContext } from "@/modules/tenants/persona";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ tenantId: string; id: string }> }
): Promise<Response> {
  const id = await requestId();
  try {
    const user = await requireApiRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
    const params = await context.params;
    if (!params.tenantId || !params.id) {
      throw new AppError("VALIDATION_ERROR", "Tenant và payout bắt buộc.", 400);
    }
    const actor = await resolveFinancialActorContext({
      actorUserId: user.id,
      targetTenantId: params.tenantId,
      source: "HTTP",
      requestId: id
    });
    const result = await revealBeneficiaryForManualPayout(actor, params.id);
    return Response.json(result, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Request-Id": id
      }
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}

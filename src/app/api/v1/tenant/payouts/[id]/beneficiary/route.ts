import { requireApiUser } from "@/lib/authz";
import { AppError, errorResponse } from "@/lib/errors";
import { requestId } from "@/lib/request";
import { revealBeneficiaryForManualPayout } from "@/modules/tenants/manual";
import {
  requireTenantMasterContext,
  resolveFinancialActorContext
} from "@/modules/tenants/persona";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const id = await requestId();
  try {
    const user = await requireApiUser();
    const tenant = (await requireTenantMasterContext(user.id)).ownedTenant;
    if (!tenant) throw new AppError("FORBIDDEN", "Không có tenant scope.", 403);
    const actor = await resolveFinancialActorContext({
      actorUserId: user.id,
      targetTenantId: tenant.id,
      source: "HTTP",
      requestId: id
    });
    const result = await revealBeneficiaryForManualPayout(actor, (await context.params).id);
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0", "X-Request-Id": id }
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}

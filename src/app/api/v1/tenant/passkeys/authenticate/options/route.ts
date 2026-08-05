import { requireApiRecentUser } from "@/lib/authz";
import { errorResponse } from "@/lib/errors";
import { assertTrustedOrigin } from "@/lib/request";
import { authenticationOptions } from "@/modules/admin/webauthn";
import { requireTenantMasterContext } from "@/modules/tenants/persona";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiRecentUser();
    await requireTenantMasterContext(user.id);
    return Response.json(await authenticationOptions(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

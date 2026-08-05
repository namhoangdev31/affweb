import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { requireApiRecentUser } from "@/lib/authz";
import { errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, readJson } from "@/lib/request";
import { verifyAuthentication } from "@/modules/admin/webauthn";
import { requireTenantMasterContext } from "@/modules/tenants/persona";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiRecentUser();
    await requireTenantMasterContext(user.id);
    const response = await readJson<AuthenticationResponseJSON>(request, 32_768);
    return Response.json(await verifyAuthentication(user.id, response));
  } catch (error) {
    return errorResponse(error);
  }
}

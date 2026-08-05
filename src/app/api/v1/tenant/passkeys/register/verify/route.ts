import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { requireApiRecentUser } from "@/lib/authz";
import { errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, readJson } from "@/lib/request";
import { verifyRegistration } from "@/modules/admin/webauthn";
import { requireTenantMasterContext } from "@/modules/tenants/persona";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiRecentUser();
    await requireTenantMasterContext(user.id);
    const response = await readJson<RegistrationResponseJSON>(request, 32_768);
    return Response.json(await verifyRegistration(user.id, response));
  } catch (error) {
    return errorResponse(error);
  }
}

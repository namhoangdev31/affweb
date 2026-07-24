import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { Role } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/authz";
import { errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, readJson } from "@/lib/request";
import { verifyAuthentication } from "@/modules/admin/webauthn";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiRole([
      Role.FINANCE_REVIEWER,
      Role.FINANCE_APPROVER,
      Role.SUPER_ADMIN
    ]);
    return Response.json(
      await verifyAuthentication(user.id, await readJson<AuthenticationResponseJSON>(request))
    );
  } catch (error) {
    return errorResponse(error);
  }
}

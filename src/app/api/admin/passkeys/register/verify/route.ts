import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { Role } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/authz";
import { errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, readJson } from "@/lib/request";
import { verifyRegistration } from "@/modules/admin/webauthn";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiRole([
      Role.FINANCE_REVIEWER,
      Role.FINANCE_APPROVER,
      Role.SUPER_ADMIN
    ]);
    return Response.json(
      await verifyRegistration(user.id, await readJson<RegistrationResponseJSON>(request))
    );
  } catch (error) {
    return errorResponse(error);
  }
}

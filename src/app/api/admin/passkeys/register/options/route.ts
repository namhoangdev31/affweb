import { requireApiRole } from "@/lib/authz";
import { Role } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/errors";
import { registrationOptions } from "@/modules/admin/webauthn";

export async function POST(): Promise<Response> {
  try {
    const user = await requireApiRole([
      Role.FINANCE_REVIEWER,
      Role.FINANCE_APPROVER,
      Role.SUPER_ADMIN
    ]);
    return Response.json(await registrationOptions(user));
  } catch (error) {
    return errorResponse(error);
  }
}

import { Role } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/authz";
import { errorResponse } from "@/lib/errors";
import { authenticationOptions } from "@/modules/admin/webauthn";

export async function POST(): Promise<Response> {
  try {
    const user = await requireApiRole([
      Role.FINANCE_REVIEWER,
      Role.FINANCE_APPROVER,
      Role.SUPER_ADMIN
    ]);
    return Response.json(await authenticationOptions(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

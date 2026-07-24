import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();
    const wallet = await db.walletProjection.findUnique({ where: { userId: user.id } });
    return Response.json(
      jsonSafe({
        wallet: wallet ?? {
          pendingVnd: 0n,
          availableVnd: 0n,
          reservedVnd: 0n,
          paidVnd: 0n
        }
      }),
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

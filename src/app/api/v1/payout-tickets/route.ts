import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();
    const tickets = await db.payoutTicket.findMany({
      where: { userId: user.id },
      include: { beneficiary: { select: { bankBin: true, accountLast4: true } } },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return Response.json(jsonSafe({ tickets }), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(): Promise<Response> {
  return Response.json(
    {
      error: {
        code: "CORE_PAYOUT_FROZEN",
        message: "Core payout writes đã đóng; sử dụng hierarchical tenant payout workflow."
      }
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}

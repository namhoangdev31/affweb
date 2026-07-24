import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();
    const conversions = await db.conversion.findMany({
      where: { userId: user.id },
      include: {
        merchant: { select: { name: true, slug: true } },
        items: { select: { name: true, quantity: true, cashbackVnd: true } }
      },
      orderBy: { purchasedAt: "desc" },
      take: 100
    });
    return Response.json(jsonSafe({ conversions }), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

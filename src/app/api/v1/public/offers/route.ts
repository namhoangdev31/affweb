import { db } from "@/lib/db";
import { jsonSafe } from "@/lib/json";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");
  const offers = await db.offerSnapshot.findMany({
    where: {
      quarantinedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...(platform &&
      ["SHOPEE_MARKETPLACE", "SHOPEE_FOOD", "LAZADA", "ACCESSTRADE"].includes(platform)
        ? { platform: platform as never }
        : {})
    },
    select: {
      id: true,
      platform: true,
      title: true,
      imageUrl: true,
      originUrl: true,
      priceVnd: true,
      originalPriceVnd: true,
      commissionBps: true,
      fetchedAt: true
    },
    orderBy: { fetchedAt: "desc" },
    take: 50
  });
  return Response.json(jsonSafe({ offers }), {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" }
  });
}

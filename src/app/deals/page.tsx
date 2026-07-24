import type { Metadata } from "next";
import { DealBrowser } from "@/components/deal-browser";
import { PublicShell } from "@/components/public-shell";
import { db } from "@/lib/db";
import { AddLiveTagConnector } from "@/modules/connectors/addlivetag";
import { Platform } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Ưu đãi cashback | Affiliate Cashback",
  description: "Tìm deal và mức cashback dự kiến từ các đối tác Shopee, Lazada, AccessTrade."
};

export const revalidate = 300; // SSR with SWR revalidation every 5 mins

export default async function DealsPage() {
  const dbOffers = await db.offerSnapshot.findMany({
    where: {
      quarantinedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    },
    select: {
      id: true,
      platform: true,
      title: true,
      imageUrl: true,
      originUrl: true,
      priceVnd: true,
      originalPriceVnd: true
    },
    orderBy: { fetchedAt: "desc" },
    take: 50
  });

  let initialDeals = dbOffers.map((o) => ({
    id: o.id,
    platform: o.platform,
    title: o.title,
    imageUrl: o.imageUrl,
    originUrl: o.originUrl,
    priceVnd: o.priceVnd ? String(o.priceVnd) : null,
    originalPriceVnd: o.originalPriceVnd ? String(o.originalPriceVnd) : null
  }));

  // Fallback to live public AddLiveTag deals feed if DB is not seeded yet
  if (initialDeals.length === 0) {
    try {
      const connector = new AddLiveTagConnector("SHOPEE_MARKETPLACE");
      const page = await connector.listOffers({ limit: 30 });
      initialDeals = page.offers.map((offer) => ({
        id: offer.externalId,
        platform: Platform.SHOPEE_MARKETPLACE,
        title: offer.title,
        imageUrl: offer.imageUrl ?? null,
        originUrl: offer.originUrl,
        priceVnd: offer.priceVnd ? String(offer.priceVnd) : null,
        originalPriceVnd: offer.originalPriceVnd ? String(offer.originalPriceVnd) : null
      }));
    } catch {
      // ignore fallback error
    }
  }

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-[#8b6d21]">
          Deal đang mở
        </p>
        <h1 className="display-type mt-4 text-6xl">Tìm món đáng mua.</h1>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Giá và cashback được pre-render trực tiếp bằng Server-Side Rendering (SSR). Hãy kiểm tra lại trên trang
          đối tác trước khi thanh toán.
        </p>
        <div className="mt-10">
          <DealBrowser initialDeals={initialDeals} />
        </div>
      </section>
    </PublicShell>
  );
}

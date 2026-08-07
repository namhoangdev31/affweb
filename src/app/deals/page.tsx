import type { Metadata } from "next";
import { DealBrowser } from "@/components/deal-browser";
import { PublicShell } from "@/components/public-shell";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Ưu đãi cashback | Affiliate Cashback",
  description: "Tìm deal HOT và nhận hoa hồng hoàn tiền hấp dẫn từ các sàn thương mại điện tử."
};

export const revalidate = 300; // SSR with SWR revalidation every 5 mins

export default async function DealsPage() {
  const dbOffers = await db.offerSnapshot.findMany({
    where: {
      quarantinedAt: null,
      platform: { in: ["SHOPEE_MARKETPLACE", "SHOPEE_FOOD", "ACCESSTRADE"] },
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

  const initialDeals = dbOffers.map((o) => ({
    id: o.id,
    platform: o.platform,
    title: o.title,
    imageUrl: o.imageUrl,
    originUrl: o.originUrl,
    priceVnd: o.priceVnd ? String(o.priceVnd) : null,
    originalPriceVnd: o.originalPriceVnd ? String(o.originalPriceVnd) : null
  }));

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-[#8b6d21]">
          Deal đang mở
        </p>
        <h1 className="display-type mt-4 text-6xl">Tìm món đáng mua.</h1>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Giá và mức hoàn tiền được tự động cập nhật liên tục. Vui lòng kiểm tra lại giá cuối cùng
          tại trang sàn trước khi đặt hàng.
        </p>
        <div className="mt-10">
          <DealBrowser initialDeals={initialDeals} />
        </div>
      </section>
    </PublicShell>
  );
}

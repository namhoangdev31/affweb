import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Badge } from "@/components/ui/badge";

const content = {
  shopee: {
    name: "Shopee",
    mode: "Live",
    description: "Tạo link marketplace với SubID riêng, đồng bộ đơn và theo dõi qua safety hold.",
    bullets: [
      "Sản phẩm, shop và campaign",
      "AddLiveTag overlap 48 giờ",
      "Ưu tiên nguồn Shopee chính thức"
    ]
  },
  shopeefood: {
    name: "ShopeeFood",
    mode: "Link live · Cashback theo flag",
    description: "Parser và attribution riêng cho Home, nhà hàng và món ăn.",
    bullets: [
      "source=food độc lập",
      "Campaign và tỷ lệ riêng",
      "Chỉ mở cashback sau round-trip fixture"
    ]
  },
  accesstrade: {
    name: "AccessTrade",
    mode: "Live",
    description: "Ưu đãi đa ngành với transaction identity idempotent.",
    bullets: ["Incremental cursor", "Raw evidence immutable", "Circuit breaker cho 401/429"]
  }
} as const;

export async function generateMetadata({
  params
}: {
  params: Promise<{ partner: string }>;
}): Promise<Metadata> {
  const { partner } = await params;
  const item = content[partner as keyof typeof content];
  return { title: item?.name ?? "Đối tác" };
}

export default async function PartnerPage({ params }: { params: Promise<{ partner: string }> }) {
  const { partner } = await params;
  const item = content[partner as keyof typeof content];
  if (!item) notFound();
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl px-5 py-24">
        <Badge>{item.mode}</Badge>
        <h1 className="display-type mt-7 text-7xl">{item.name}</h1>
        <p className="mt-6 max-w-2xl text-xl leading-8 text-muted-foreground">{item.description}</p>
        <div className="mt-12 grid gap-4">
          {item.bullets.map((bullet) => (
            <div key={bullet} className="flex items-center gap-3 rounded-2xl border bg-card p-5">
              <CheckCircle2 className="size-5 text-primary" />
              <p className="font-medium">{bullet}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}

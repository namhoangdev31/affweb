import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check, Clock3 } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Đối tác",
  description: "Shopee, ShopeeFood, Lazada và AccessTrade trên Hoàn Tiền."
};

const partners = [
  {
    name: "Shopee",
    slug: "shopee",
    status: "Đang hoạt động",
    icon: "S",
    description: "Marketplace, tracking trực tiếp và conversion qua AddLiveTag.",
    active: true
  },
  {
    name: "ShopeeFood",
    slug: "shopeefood",
    status: "Link sẵn sàng",
    icon: "F",
    description: "Attribution riêng cho nhà hàng, món ăn và ShopeeFood Home.",
    active: true
  },
  {
    name: "AccessTrade",
    slug: "accesstrade",
    status: "Đang hoạt động",
    icon: "A",
    description: "Ưu đãi đa ngành với conversion incremental và đối soát.",
    active: true
  },
  {
    name: "Lazada",
    slug: "lazada",
    status: "Chờ credential",
    icon: "L",
    description: "Connector đã credential-ready, sẽ shadow sync khi token được cấp.",
    active: false
  }
];

export default function PartnersPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-[#8b6d21]">
          Hệ sinh thái
        </p>
        <h1 className="display-type mt-4 max-w-3xl text-6xl">Những nơi bạn vẫn mua mỗi ngày.</h1>
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {partners.map((partner) => (
            <Link href={`/partners/${partner.slug}`} key={partner.slug}>
              <Card className="h-full transition-transform hover:-translate-y-1">
                <CardContent className="flex gap-5 p-7">
                  <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">
                    {partner.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-xl font-semibold">{partner.name}</h2>
                      <ArrowUpRight className="size-5" />
                    </div>
                    <Badge variant="secondary" className="mt-2 gap-1">
                      {partner.active ? <Check /> : <Clock3 />}
                      {partner.status}
                    </Badge>
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      {partner.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}

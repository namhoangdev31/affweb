"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Deal = {
  id: string;
  platform: string;
  title: string;
  imageUrl: string | null;
  originUrl: string;
  priceVnd: string | null;
  originalPriceVnd: string | null;
};

export function DealBrowser() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/public/deals", { signal: controller.signal })
      .then((response) => response.json() as Promise<{ offers: Deal[] }>)
      .then((data) => setDeals(data.offers))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const filtered = useMemo(
    () => deals.filter((deal) => deal.title.toLowerCase().includes(query.toLowerCase())),
    [deals, query]
  );

  return (
    <div>
      <label className="relative block max-w-xl">
        <span className="sr-only">Tìm ưu đãi</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm sản phẩm hoặc ưu đãi"
          className="h-13 rounded-full bg-card pl-12"
        />
      </label>
      {loading ? (
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-64 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((deal) => (
            <Card key={deal.id} className="overflow-hidden">
              <CardContent className="p-6">
                <Badge variant="secondary">{deal.platform.replaceAll("_", " ")}</Badge>
                <h2 className="mt-5 line-clamp-2 text-lg font-semibold">{deal.title}</h2>
                <div className="mt-6 flex items-end justify-between">
                  <p className="font-semibold">
                    {deal.priceVnd
                      ? new Intl.NumberFormat("vi-VN", {
                          style: "currency",
                          currency: "VND",
                          maximumFractionDigits: 0
                        }).format(Number(deal.priceVnd))
                      : "Xem giá tại đối tác"}
                  </p>
                  <Tag className="size-5 text-[#8b6d21]" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-3xl border border-dashed bg-card/50 p-12 text-center">
          <Tag className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-4 font-medium">Chưa có deal phù hợp</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Dữ liệu live sẽ xuất hiện sau lần đồng bộ connector đầu tiên.
          </p>
        </div>
      )}
    </div>
  );
}

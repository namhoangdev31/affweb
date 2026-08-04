"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Search, Copy, Check, Zap, Sparkles, ShoppingBag, Info, Star, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVnd } from "@/lib/utils";

interface ProductData {
  product: {
    itemId: string;
    shopId: string;
    title: string;
    shopName: string;
    priceVnd: string;
    salesCount: number;
    imageUrl?: string;
    rating: string;
    isXtra: boolean;
    canonicalUrl: string;
  };
  commission: {
    totalVnd: string;
    totalPercent: number;
    sellerVnd: string;
    sellerPercent: number;
    shopeeVnd: string;
    shopeePercent: number;
    capVnd: string;
    isCapped: boolean;
  };
}

export function ShopeeProductLookup({
  initialUrl = "",
  initialData = null
}: {
  initialUrl?: string;
  initialData?: ProductData | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProductData | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);

  async function lookup(targetUrl: string) {
    if (!targetUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/shopee/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl.trim() })
      });
      const body = (await response.json()) as ProductData & { error?: { message?: string } };
      if (!response.ok || !body.product) {
        throw new Error(body.error?.message ?? "Không tìm thấy sản phẩm Shopee này.");
      }
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lỗi tra cứu sản phẩm.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialUrl && !initialData) {
      // The URL comes from the server-rendered query string; this effect performs the one initial lookup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void lookup(initialUrl);
    }
  }, [initialUrl, initialData]);

  async function createTrackingLink(openInNewTab: boolean) {
    if (!data || trackingLoading) return;
    setTrackingLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({ url: data.product.canonicalUrl })
      });
      const body = (await response.json()) as {
        redirectUrl?: string;
        error?: { code?: string; message?: string };
      };
      if (response.status === 401) {
        window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`);
        return;
      }
      if (!response.ok || !body.redirectUrl) {
        throw new Error(body.error?.message ?? "Không thể tạo link tracking.");
      }
      const trackingUrl = new URL(body.redirectUrl, window.location.origin).toString();
      if (openInNewTab) {
        window.open(trackingUrl, "_blank", "noopener,noreferrer");
      } else {
        await navigator.clipboard.writeText(trackingUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo link tracking.");
    } finally {
      setTrackingLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-foreground">
      {/* Header Search Box */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#121513] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="absolute -right-20 -top-20 size-60 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 size-60 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2.5 text-2xl font-bold text-white sm:text-3xl">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/20">
                <Flame className="size-6" />
              </span>
              Tra cứu hoa hồng sản phẩm Shopee
            </h2>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(url);
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <div className="relative flex-1">
              <Input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Dán link sản phẩm Shopee (shopee.vn/product/..., shp.ee/...) hoặc Item ID..."
                className="h-13 rounded-2xl border-white/15 bg-white/5 pl-4 pr-10 text-white placeholder:text-white/40 focus-visible:border-amber-400 focus-visible:ring-amber-400/30"
              />
              {url ? (
                <button
                  type="button"
                  onClick={() => setUrl("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  ✕
                </button>
              ) : null}
            </div>
            <Button
              type="submit"
              disabled={loading || !url.trim()}
              className="h-13 px-8 text-base font-semibold text-white shadow-lg transition-all"
              style={{
                background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)"
              }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Đang tra...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search className="size-5" /> Tra cứu
                </span>
              )}
            </Button>
          </form>

          <p className="text-xs text-white/50">
            Hỗ trợ link <code className="text-amber-400/90">shopee.vn/product/...</code>, link rút
            gọn <code className="text-amber-400/90">shp.ee/...</code>, hoặc nhập trực tiếp{" "}
            <code className="text-amber-400/90">item_id</code>.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error ? (
        <Card className="border-red-500/30 bg-red-950/20 text-red-200">
          <CardContent className="flex items-center gap-3 p-4">
            <Info className="size-5 text-red-400 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Product & Commission Result Card */}
      {data ? (
        <div className="space-y-6">
          <Card className="overflow-hidden border-white/10 bg-[#161a18] text-white shadow-2xl">
            <CardContent className="p-6 sm:p-8">
              <div className="grid gap-6 md:grid-cols-[280px_1fr]">
                {/* Product Thumbnail */}
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                  {data.product.imageUrl ? (
                    <Image
                      src={data.product.imageUrl}
                      alt={data.product.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 280px"
                      className="size-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-white/40">
                      <ShoppingBag className="size-16" />
                    </div>
                  )}
                  {data.product.isXtra ? (
                    <Badge className="absolute left-3 top-3 border-none bg-gradient-to-r from-amber-500 to-red-500 font-bold uppercase tracking-wider text-white shadow-md">
                      ⚡ XTRA
                    </Badge>
                  ) : null}
                </div>

                {/* Product Main Details */}
                <div className="flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      <span className="rounded-md bg-white/10 px-2 py-0.5 font-medium text-amber-300">
                        {data.product.shopName}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold leading-snug text-white sm:text-2xl">
                      {data.product.title}
                    </h3>
                  </div>

                  {/* Highlight Commission Banner */}
                  <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                      <Sparkles className="size-5 text-amber-400" />
                      Hoa hồng ước tính:
                    </div>
                    <div className="mt-1 flex items-baseline gap-3">
                      <span className="text-3xl font-black text-amber-400 sm:text-4xl">
                        {data.commission.totalPercent}%
                      </span>
                      <span className="text-2xl font-extrabold text-white underline decoration-amber-400/50">
                        ≈ {formatVnd(BigInt(data.commission.totalVnd))}
                      </span>
                    </div>
                  </div>

                  {/* Price & Sales Stat */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-white/70">
                    <div>
                      Giá bán:{" "}
                      <span className="text-2xl font-bold text-white">
                        {formatVnd(BigInt(data.product.priceVnd))}
                      </span>
                    </div>
                    <div className="h-4 w-px bg-white/20" />
                    <div className="flex items-center gap-1">
                      <Star className="size-4 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-white">{data.product.rating}</span>
                    </div>
                    <div className="h-4 w-px bg-white/20" />
                    <div>🛒 {data.product.salesCount} đã bán</div>
                    <div className="h-4 w-px bg-white/20" />
                    <div className="font-mono text-xs text-white/40">#{data.product.itemId}</div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      type="button"
                      onClick={() => void createTrackingLink(true)}
                      disabled={trackingLoading}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white shadow-lg transition-all hover:bg-orange-500"
                    >
                      <ShoppingBag className="size-5" /> Xem trên Shopee
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void createTrackingLink(false)}
                      disabled={trackingLoading}
                      className="h-12 border-white/20 bg-white/10 px-5 text-white hover:bg-white/20"
                    >
                      {copied ? (
                        <Check className="size-5 text-emerald-400" />
                      ) : (
                        <Copy className="size-5" />
                      )}
                      {copied ? "Đã chép link!" : "Copy link affiliate"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Commission Breakdown Details */}
          <Card className="border-white/10 bg-[#161a18] text-white">
            <CardContent className="p-6 space-y-4">
              <h4 className="flex items-center gap-2 font-bold text-lg text-white">
                <Zap className="size-5 text-amber-400" /> Chi tiết hoa hồng Shopee
              </h4>

              <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="flex items-center justify-between p-4 bg-amber-500/10 font-bold text-amber-300">
                  <div className="flex items-center gap-2">
                    <span>Tổng hoa hồng</span>
                    <Badge className="bg-amber-500 text-black font-bold">
                      {data.commission.totalPercent}%
                    </Badge>
                  </div>
                  <span className="text-xl underline decoration-amber-400">
                    {formatVnd(BigInt(data.commission.totalVnd))}
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 text-sm text-white/90">
                  <div className="flex items-center gap-2">
                    <span>Hoa hồng Seller</span>
                    <Badge variant="outline" className="border-white/20 text-white/80">
                      {data.commission.sellerPercent}%
                    </Badge>
                  </div>
                  <span className="font-mono font-semibold">
                    {formatVnd(BigInt(data.commission.sellerVnd))}
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 text-sm text-white/90">
                  <div className="flex items-center gap-2">
                    <span>Hoa hồng Shopee</span>
                    <Badge variant="outline" className="border-white/20 text-white/80">
                      {data.commission.shopeePercent}%
                    </Badge>
                  </div>
                  <span className="font-mono font-semibold">
                    {formatVnd(BigInt(data.commission.shopeeVnd))}
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 text-sm text-white/70">
                  <span>Giới hạn hoa hồng tối đa (Cap)</span>
                  <span className="font-mono">{formatVnd(BigInt(data.commission.capVnd))}</span>
                </div>

                <div className="flex items-center justify-between p-4 text-sm text-white/70">
                  <span>Trạng thái Cap</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    {data.commission.isCapped ? "Chạm mốc Cap" : "Bình thường"}
                  </Badge>
                </div>
              </div>

              <p className="flex items-center gap-2 text-xs text-white/50">
                <Info className="size-4 shrink-0 text-amber-400" />
                Số liệu mang tính tham khảo dựa trên giá niêm yết hiện tại. Tỷ lệ thực tế khi ra đơn
                có thể thay đổi tùy kênh (App/Web) và khuyến mãi của Shopee.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

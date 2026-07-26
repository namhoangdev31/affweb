"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  ShoppingBag,
  Sparkles,
  Star,
  X,
  Zap
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatVnd } from "@/lib/utils";

interface ProductPreview {
  itemId: string;
  title: string;
  shopName: string;
  priceVnd: number;
  imageUrl?: string | undefined;
  rating: string;
  salesCount: number;
  isXtra: boolean;
  commission: {
    totalVnd: number;
    totalPercent: number;
    sellerVnd: number;
    sellerPercent: number;
    shopeeVnd: number;
    shopeePercent: number;
    capVnd: number;
    isCapped: boolean;
  };
}

export function LinkBuilder({
  campaigns
}: {
  campaigns: Array<{ id: string; name: string; merchantName: string; platform: string }>;
}) {
  const [url, setUrl] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [result, setResult] = useState<{
    url: string;
    cashbackEnabled: boolean;
    platform: string;
    product?: ProductPreview | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 1. Generate affiliate tracking link
      const response = await fetch("/api/v1/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), ...(campaignId ? { campaignId } : {}) })
      });
      const body = (await response.json()) as {
        redirectUrl?: string;
        cashbackEnabled?: boolean;
        platform?: string;
        product?: {
          itemId: string;
          title: string;
          shopName: string;
          priceVnd: number;
          imageUrl?: string;
          rating: string;
          salesCount: number;
          isXtra: boolean;
        };
        commission?: {
          totalVnd: number;
          totalPercent: number;
          sellerVnd: number;
          sellerPercent: number;
          shopeeVnd: number;
          shopeePercent: number;
          capVnd: number;
          isCapped: boolean;
        };
        error?: { message?: string };
      };

      if (!response.ok || !body.redirectUrl) {
        throw new Error(body.error?.message ?? "Không thể tạo link affiliate.");
      }

      const generatedUrl = new URL(body.redirectUrl, window.location.origin).toString();
      let productPreview: ProductPreview | null = null;

      if (body.product && body.commission) {
        productPreview = {
          itemId: body.product.itemId,
          title: body.product.title,
          shopName: body.product.shopName,
          priceVnd: body.product.priceVnd,
          imageUrl: body.product.imageUrl,
          rating: body.product.rating,
          salesCount: body.product.salesCount,
          isXtra: body.product.isXtra,
          commission: body.commission
        };
      } else {
        // Fallback fetch if /api/v1/links didn't include product data
        const inputLower = url.toLowerCase();
        if (
          inputLower.includes("shopee") ||
          inputLower.includes("shp.ee") ||
          /^\d+$/.test(url.trim())
        ) {
          try {
            const productRes = await fetch("/api/v1/shopee/product", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: url.trim() })
            });
            if (productRes.ok) {
              const productData = (await productRes.json()) as {
                ok?: boolean;
                product?: ProductPreview;
                commission?: ProductPreview["commission"];
              };
              if (productData.ok && productData.product && productData.commission) {
                productPreview = {
                  itemId: productData.product.itemId,
                  title: productData.product.title,
                  shopName: productData.product.shopName,
                  priceVnd: productData.product.priceVnd,
                  imageUrl: productData.product.imageUrl,
                  rating: productData.product.rating,
                  salesCount: productData.product.salesCount,
                  isXtra: productData.product.isXtra,
                  commission: productData.commission
                };
              }
            }
          } catch {
            // Ignore preview fetch error
          }
        }
      }

      setResult({
        url: generatedUrl,
        cashbackEnabled: body.cashbackEnabled !== false,
        platform: body.platform ?? "SHOPEE_MARKETPLACE",
        product: productPreview
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo link.");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full max-w-4xl space-y-6">
      {/* 1. Input Form Card */}
      <Card className="w-full border border-white/10 bg-[#141816] text-white shadow-2xl rounded-3xl overflow-hidden backdrop-blur-xl">
        <CardHeader className="p-6 sm:p-7 border-b border-white/10 bg-white/[0.02]">
          <CardTitle className="flex items-center gap-3 text-xl sm:text-2xl font-bold text-white">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 shrink-0">
              <Link2 className="size-5" />
            </span>
            Tạo tracking link & Tra cứu hoa hồng
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 sm:p-7 space-y-5">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="product-url" className="text-sm sm:text-base font-semibold text-white/90">
                Dán URL sản phẩm (Shopee, ShopeeFood, AccessTrade, Lazada)
              </Label>
              <div className="relative w-full">
                <Input
                  id="product-url"
                  type="text"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="Dán link sản phẩm (ví dụ: https://shopee.vn/product/..., https://s.shopee.vn/...)"
                  required
                  disabled={loading}
                  className="h-14 w-full rounded-2xl border-white/15 bg-white/5 pl-6 pr-14 text-base text-white placeholder:text-white/40 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                />
                {url ? (
                  <button
                    type="button"
                    onClick={() => setUrl("")}
                    title="Xóa URL"
                    className="absolute right-4 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full bg-white/10 text-white/60 transition-all hover:bg-white/20 hover:text-white active:scale-95"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-white/50">
                Tự động hỗ trợ link gốc, link rút gọn <code className="text-emerald-400">s.shopee.vn</code> / <code className="text-emerald-400">shp.ee</code> và tra cứu ngay hoa hồng hoàn về ví.
              </p>
            </div>

            {campaigns.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="campaign" className="text-sm font-medium text-white/80">
                  Chiến dịch (Campaign)
                </Label>
                <select
                  id="campaign"
                  value={campaignId}
                  onChange={(event) => setCampaignId(event.target.value)}
                  disabled={loading}
                  className="h-12 w-full rounded-2xl border border-white/15 bg-[#1a201c] px-4 text-sm text-white outline-none focus:border-emerald-400"
                >
                  <option value="">Tự động nhận diện theo đối tác</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.merchantName} — {campaign.name} ({campaign.platform})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                disabled={loading || !url.trim()}
                className="h-13 w-full sm:w-auto px-8 text-base font-bold text-white shadow-lg transition-all rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-5 animate-spin" /> Đang tạo & tính hoa hồng...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="size-5 text-amber-300" /> Tạo link & Tính hoa hồng
                  </span>
                )}
              </Button>
            </div>
          </form>

          {error ? (
            <Alert variant="destructive" className="border-red-500/30 bg-red-950/30 text-red-200 rounded-2xl">
              <Info className="size-5 text-red-400 shrink-0" />
              <AlertTitle className="font-bold">Chưa tạo được link</AlertTitle>
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {/* 2. Seamless Luxury Link Result Card */}
      {result ? (
        <div className="w-full space-y-6">
          <Card className="w-full border border-emerald-500/30 bg-[#121815]/95 text-white shadow-[0_0_50px_-12px_rgba(16,185,129,0.2)] rounded-3xl overflow-hidden backdrop-blur-xl transition-all">
            <CardContent className="p-6 sm:p-8 space-y-5">
              {/* Success Badge & Status Indicator */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs sm:text-sm font-bold text-emerald-400">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
                  </span>
                  {result.cashbackEnabled
                    ? "Link tracking & cashback đã sẵn sàng!"
                    : "Link tracking đã sẵn sàng (chế độ không cashback)"}
                </div>
                <span className="text-xs font-mono text-white/40">Affiliate Tracking Link</span>
              </div>

              {/* URL Input & Action Buttons Row */}
              <div className="space-y-2 pt-1">
                <Label className="text-xs font-semibold uppercase tracking-wider text-emerald-400/90">
                  Link tracking cashback của bạn
                </Label>
                <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full">
                  <div className="flex-1 min-w-0 w-full">
                    <Input
                      value={result.url}
                      readOnly
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="h-13 w-full rounded-2xl border-emerald-500/40 bg-[#090d0b] px-6 font-mono text-sm font-semibold text-emerald-300 focus-visible:ring-emerald-400 select-all shadow-inner"
                    />
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <Button
                      type="button"
                      onClick={copyToClipboard}
                      className="h-13 px-6 rounded-2xl font-bold text-white transition-all bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-500/20 flex-1 sm:flex-initial"
                    >
                      {copied ? <Check className="size-5 text-white" /> : <Copy className="size-5" />}
                      {copied ? "Đã sao chép!" : "Sao chép link"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      asChild
                      className="h-13 px-5 rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/15 flex-1 sm:flex-initial"
                    >
                      <a href={result.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-5" /> Mở thử
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. Product & Commission Breakdown Card */}
          {result.product ? (
            <Card className="w-full overflow-hidden border border-amber-500/30 bg-[#161a18] text-white shadow-2xl rounded-3xl">
              <CardContent className="p-6 sm:p-8 space-y-6">
                {/* Product Meta Header */}
                <div className="grid gap-6 md:grid-cols-[180px_1fr] items-start">
                  <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-black/40 w-full max-w-[180px] mx-auto md:mx-0">
                    {result.product.imageUrl ? (
                      // eslint-disable-next-error
                      <img
                        src={result.product.imageUrl}
                        alt={result.product.title}
                        className="size-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-white/40">
                        <ShoppingBag className="size-16" />
                      </div>
                    )}
                    {result.product.isXtra ? (
                      <Badge className="absolute left-2 top-2 border-none bg-gradient-to-r from-amber-500 to-red-500 font-bold text-[11px] text-white shadow-md">
                        ⚡ XTRA
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded-md bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                          {result.product.shopName}
                        </span>
                        <span className="font-mono text-xs text-white/40">
                          ID: #{result.product.itemId}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold leading-snug text-white sm:text-xl">
                        {result.product.title}
                      </h3>
                    </div>

                    {/* Main Cashback Highlight Banner */}
                    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-transparent p-4 sm:p-5">
                      <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-300 uppercase tracking-wider">
                        <Sparkles className="size-4 text-amber-400" /> Hoa hồng ước tính hoàn về ví:
                      </div>
                      <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                        <span className="text-2xl font-black text-amber-400 sm:text-3xl">
                          ≈ {formatVnd(BigInt(result.product.commission.totalVnd))}
                        </span>
                        <span className="text-base font-bold text-emerald-400 bg-emerald-500/20 px-3 py-0.5 rounded-xl border border-emerald-500/30">
                          {result.product.commission.totalPercent}%
                        </span>
                      </div>
                    </div>

                    {/* Price & Sales Stats Bar */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-white/80 pt-1">
                      <div>
                        Giá bán:{" "}
                        <span className="text-xl font-extrabold text-white">
                          {formatVnd(BigInt(result.product.priceVnd))}
                        </span>
                      </div>
                      <div className="h-4 w-px bg-white/20" />
                      <div className="flex items-center gap-1">
                        <Star className="size-4 fill-amber-400 text-amber-400" />
                        <span className="font-bold text-white">{result.product.rating}</span>
                      </div>
                      <div className="h-4 w-px bg-white/20" />
                      <div className="font-medium">🛒 {result.product.salesCount} đã bán</div>
                    </div>
                  </div>
                </div>

                {/* Detailed Commission Table */}
                <div className="space-y-3 pt-2">
                  <h4 className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                    <Zap className="size-4 text-amber-400" /> Thành phần hoa hồng chi tiết từ sàn
                  </h4>

                  <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="flex items-center justify-between p-4 bg-amber-500/15 font-bold text-amber-300">
                      <div className="flex items-center gap-2">
                        <span>Tổng hoa hồng nhận được</span>
                        <Badge className="bg-amber-500 text-black font-bold">
                          {result.product.commission.totalPercent}%
                        </Badge>
                      </div>
                      <span className="text-lg font-mono underline decoration-amber-400 font-extrabold">
                        {formatVnd(BigInt(result.product.commission.totalVnd))}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-4 text-sm text-white/90">
                      <div className="flex items-center gap-2">
                        <span>Hoa hồng người bán (Seller)</span>
                        <Badge variant="outline" className="border-white/20 text-white/80 font-mono">
                          {result.product.commission.sellerPercent}%
                        </Badge>
                      </div>
                      <span className="font-mono font-semibold text-white">
                        {formatVnd(BigInt(result.product.commission.sellerVnd))}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-4 text-sm text-white/90">
                      <div className="flex items-center gap-2">
                        <span>Hoa hồng sàn (Shopee / Platform)</span>
                        <Badge variant="outline" className="border-white/20 text-white/80 font-mono">
                          {result.product.commission.shopeePercent}%
                        </Badge>
                      </div>
                      <span className="font-mono font-semibold text-white">
                        {formatVnd(BigInt(result.product.commission.shopeeVnd))}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-4 text-sm text-white/70">
                      <span>Mức thưởng tối đa mỗi đơn (Cap)</span>
                      <span className="font-mono font-medium">{formatVnd(BigInt(result.product.commission.capVnd))}</span>
                    </div>

                    <div className="flex items-center justify-between p-4 text-sm text-white/70">
                      <span>Trạng thái Cap</span>
                      <Badge className={result.product.commission.isCapped ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"}>
                        {result.product.commission.isCapped ? "Chạm mốc Cap" : "Trong mốc an toàn"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

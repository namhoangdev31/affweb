"use client";

import { useState } from "react";
import { Check, Copy, Link2, Loader2, ShoppingBag, Sparkles, Zap, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatVnd } from "@/lib/utils";

interface ProductPreview {
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
    shopeeVnd: number;
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
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/v1/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, ...(campaignId ? { campaignId } : {}) })
      });
      const body = (await response.json()) as {
        redirectUrl?: string;
        cashbackEnabled?: boolean;
        platform?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.redirectUrl)
        throw new Error(body.error?.message ?? "Không thể tạo link.");

      const generatedUrl = new URL(body.redirectUrl, window.location.origin).toString();
      let productPreview: ProductPreview | null = null;

      // Try fetching Shopee product info if input is a Shopee URL
      if (url.toLowerCase().includes("shopee") || url.toLowerCase().includes("shp.ee")) {
        try {
          const productRes = await fetch("/api/v1/shopee/product", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
          });
          if (productRes.ok) {
            const productData = (await productRes.json()) as {
              ok?: boolean;
              product?: {
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
                shopeeVnd: number;
              };
            };
            if (productData.ok && productData.product && productData.commission) {
              productPreview = {
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
          // Ignore preview errors
        }
      }

      setResult({
        url: generatedUrl,
        cashbackEnabled: body.cashbackEnabled !== false,
        platform: body.platform ?? "UNKNOWN",
        product: productPreview
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo link.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Card className="max-w-3xl border-white/10 bg-[#121614] text-white shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-bold text-white">
          <Link2 className="size-5 text-emerald-400" /> Tạo tracking link & Tra cứu hoa hồng
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-url" className="text-white/80 font-medium">
              URL sản phẩm Shopee / Lazada / AccessTrade
            </Label>
            <Input
              id="product-url"
              type="text"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://shopee.vn/product/230419876/58055062502..."
              required
              disabled={loading}
              className="h-12 border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:border-emerald-400"
            />
            <p className="text-xs text-white/50">
              Tự động bóc tách thông tin sản phẩm và hiển thị hoa hồng dự kiến khi dán link Shopee.
            </p>
          </div>

          {campaigns.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="campaign" className="text-white/80 font-medium">
                Campaign (bắt buộc với AccessTrade)
              </Label>
              <select
                id="campaign"
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                disabled={loading}
                className="h-10 w-full rounded-md border border-white/15 bg-[#1a201c] px-3 text-sm text-white shadow-xs outline-none focus:border-emerald-400"
              >
                <option value="">Tự nhận diện từ URL</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.merchantName} — {campaign.name} ({campaign.platform})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={loading || !url.trim()}
            className="h-11 bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
          >
            {loading ? <Loader2 className="size-5 animate-spin" /> : <ShoppingBag className="size-5" />}
            {loading ? "Đang xử lý..." : "Tạo link & Tính hoa hồng"}
          </Button>
        </form>

        {error ? (
          <Alert variant="destructive" className="border-red-500/30 bg-red-950/20 text-red-200">
            <AlertTitle>Chưa tạo được link</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <div className="space-y-4 pt-2">
            <Alert className="border-emerald-500/30 bg-emerald-950/20 text-emerald-200">
              <Check className="size-4 text-emerald-400" />
              <AlertTitle className="font-bold text-emerald-300">
                {result.cashbackEnabled
                  ? "Link cashback đã sẵn sàng!"
                  : "Link tracking đã sẵn sàng — cashback đang tắt"}
              </AlertTitle>
              <AlertDescription className="mt-3 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input value={result.url} readOnly className="border-white/20 bg-black/40 font-mono text-xs text-white" />
                  <Button type="button" variant="outline" onClick={copy} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
                    {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                    {copied ? "Đã chép" : "Sao chép"}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>

            {/* Product & Estimated Commission Preview Banner */}
            {result.product ? (
              <Card className="overflow-hidden border-amber-500/30 bg-gradient-to-r from-[#1e1c16] to-[#161a18] text-white shadow-xl">
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    {result.product.imageUrl ? (
                      // eslint-disable-next-error
                      <img
                        src={result.product.imageUrl}
                        alt={result.product.title}
                        className="size-20 rounded-xl object-cover border border-white/10 shrink-0"
                      />
                    ) : null}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-amber-400">
                          {result.product.shopName}
                        </span>
                        {result.product.isXtra ? (
                          <Badge className="bg-orange-500 text-white text-[10px] font-bold">
                            XTRA
                          </Badge>
                        ) : null}
                      </div>
                      <p className="font-bold text-sm text-white line-clamp-2">
                        {result.product.title}
                      </p>
                      <p className="text-xs text-white/60">
                        Giá: <span className="font-bold text-white">{formatVnd(BigInt(result.product.priceVnd))}</span>
                      </p>
                    </div>
                  </div>

                  {/* Estimated Cashback Banner */}
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-4 text-center">
                    <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-300 uppercase tracking-wider">
                      <Sparkles className="size-4 text-amber-400" /> Hoa hồng dự kiến
                    </p>
                    <p className="mt-1 text-2xl font-black text-emerald-400 sm:text-3xl">
                      {formatVnd(BigInt(result.product.commission.totalVnd))}
                      <span className="text-sm font-semibold text-white/80 ml-2">
                        ({result.product.commission.totalPercent}%)
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

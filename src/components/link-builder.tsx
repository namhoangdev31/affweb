"use client";

import { useState } from "react";
import { Check, Copy, Link2, Loader2, ShoppingBag } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      setResult({
        url: new URL(body.redirectUrl, window.location.origin).toString(),
        cashbackEnabled: body.cashbackEnabled !== false,
        platform: body.platform ?? "UNKNOWN"
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
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-5" /> Tạo tracking link
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-url">URL sản phẩm, shop hoặc nhà hàng</Label>
            <Input
              id="product-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://shopee.vn/..."
              required
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Hỗ trợ Shopee, ShopeeFood và Lazada. AccessTrade dùng campaign đã cấu hình.
            </p>
          </div>
          {campaigns.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="campaign">Campaign (bắt buộc với AccessTrade)</Label>
              <select
                id="campaign"
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                disabled={loading}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
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
          <Button type="submit" disabled={loading || !url}>
            {loading ? <Loader2 className="animate-spin" /> : <ShoppingBag />}
            Tạo tracking link
          </Button>
        </form>
        {error ? (
          <Alert variant="destructive" className="mt-5">
            <AlertTitle>Chưa tạo được link</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {result ? (
          <Alert className="mt-5">
            <Check className="size-4" />
            <AlertTitle>
              {result.cashbackEnabled
                ? "Link cashback đã sẵn sàng"
                : "Link tracking đã sẵn sàng — cashback đang tắt"}
            </AlertTitle>
            <AlertDescription className="mt-3">
              {!result.cashbackEnabled ? (
                <p className="mb-3 text-sm">
                  Link {result.platform} vẫn theo dõi lượt nhấp, nhưng click này được snapshot tỷ lệ
                  0% và sẽ không phát sinh cashback.
                </p>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input value={result.url} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={copy}>
                  {copied ? <Check /> : <Copy />} {copied ? "Đã chép" : "Sao chép"}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

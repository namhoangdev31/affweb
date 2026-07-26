import { loadServerEnv } from "@/lib/env";

export interface ShopeeProductResult {
  product: {
    itemId: string;
    shopId: string;
    title: string;
    shopName: string;
    priceVnd: number;
    salesCount: number;
    imageUrl?: string;
    rating: string;
    isXtra: boolean;
    canonicalUrl: string;
    trackingUrl: string;
  };
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

export async function resolveShopeeShortUrl(shortUrl: string): Promise<string> {
  try {
    const res = await fetch(shortUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
      },
      signal: AbortSignal.timeout(6000)
    });
    return res.url;
  } catch {
    return shortUrl;
  }
}

export function extractShopeeIds(input: string): { shopId?: string; itemId?: string } {
  const pathMatch = input.match(/\/(?:product\/)?(\d+)\/(\d+)/);
  if (pathMatch?.[1] && pathMatch?.[2]) {
    return { shopId: pathMatch[1], itemId: pathMatch[2] };
  }
  const iMatch = input.match(/-i\.(\d+)\.(\d+)/);
  if (iMatch?.[1] && iMatch?.[2]) {
    return { shopId: iMatch[1], itemId: iMatch[2] };
  }
  try {
    const urlObj = new URL(input);
    const itemid = urlObj.searchParams.get("itemid") || urlObj.searchParams.get("item_id");
    const shopid = urlObj.searchParams.get("shopid") || urlObj.searchParams.get("shop_id");
    if (itemid) return shopid ? { itemId: itemid, shopId: shopid } : { itemId: itemid };
  } catch {
    // not a valid URL string
  }
  if (/^\d+$/.test(input.trim())) {
    return { itemId: input.trim() };
  }
  return {};
}

export async function parseShopeeVideoPage(videoUrl: string): Promise<{
  title: string;
  shopName: string;
  imageUrl?: string;
} | null> {
  try {
    const res = await fetch(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch =
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    const descMatch =
      html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
      html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);

    let rawTitle = descMatch?.[1] || titleMatch?.[1] || "Shopee Video";
    rawTitle = rawTitle.replace(/\|.*$/i, "").trim();

    let shopName = "Shopee Video Creator";
    if (titleMatch?.[1] && titleMatch[1].includes(" on Shopee Video")) {
      shopName = titleMatch[1].replace(" on Shopee Video", "").trim();
    }

    return {
      title: rawTitle,
      shopName,
      ...(imageMatch?.[1] ? { imageUrl: imageMatch[1] } : {})
    };
  } catch {
    return null;
  }
}

export async function fetchShopeeProductData(inputUrl: string): Promise<ShopeeProductResult | null> {
  let targetUrl = inputUrl.trim();
  let expandedUrl = targetUrl;

  let { shopId, itemId } = extractShopeeIds(targetUrl);

  // Expand short URLs (e.g. s.shopee.vn/..., shp.ee/...) if IDs aren't directly in the input
  if (!itemId && (targetUrl.includes("shopee.vn") || targetUrl.includes("shp.ee"))) {
    expandedUrl = await resolveShopeeShortUrl(targetUrl);
    const extracted = extractShopeeIds(expandedUrl);
    shopId = extracted.shopId;
    itemId = extracted.itemId;
  }

  // Handle Shopee Video share links (e.g. sv.shopee.vn/share-video/...)
  if (!itemId && (expandedUrl.includes("sv.shopee.vn") || expandedUrl.includes("share-video"))) {
    const videoMeta = await parseShopeeVideoPage(expandedUrl);
    if (videoMeta) {
      return {
        product: {
          itemId: "video",
          shopId: "video",
          title: videoMeta.title,
          shopName: videoMeta.shopName,
          priceVnd: 0,
          salesCount: 0,
          ...(videoMeta.imageUrl ? { imageUrl: videoMeta.imageUrl } : {}),
          rating: "5.0",
          isXtra: false,
          canonicalUrl: expandedUrl,
          trackingUrl: targetUrl
        },
        commission: {
          totalVnd: 0,
          totalPercent: 0,
          sellerVnd: 0,
          sellerPercent: 0,
          shopeeVnd: 0,
          shopeePercent: 0,
          capVnd: 40000,
          isCapped: false
        }
      };
    }
  }

  if (!itemId) return null;

  try {
    const env = loadServerEnv();
    const apiUrl = new URL(env.ADDLIVETAG_PRODUCT_DATA_URL);
    apiUrl.searchParams.set("item_id", itemId);
    if (shopId) apiUrl.searchParams.set("shop_id", shopId);

    const response = await fetch(apiUrl.toString(), {
      next: { revalidate: 3600 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      status?: string;
      productInfo?: {
        itemId: number | string;
        productName: string;
        shopName?: string;
        price: number;
        sales?: number;
        imageUrl?: string;
        productLink?: string;
        rating?: string;
        commission?: number;
        sellerComFinal?: number;
        shopeeComFinal?: number;
        isXtra?: boolean;
        isCapped?: boolean;
        cap?: number;
      };
    };

    if (payload.status !== "success" || !payload.productInfo) return null;

    const info = payload.productInfo;
    const affiliateId = env.SHOPEE_AFFILIATE_ID || "17330520179";
    const canonicalProductUrl = info.productLink ?? `https://shopee.vn/product/${shopId ?? ""}/${itemId}`;
    const redirectUrl = `https://s.shopee.vn/an_redir?origin_link=${encodeURIComponent(canonicalProductUrl)}&affiliate_id=${affiliateId}`;

    const totalCom = info.commission ?? 0;
    const sellerCom = info.sellerComFinal ?? 0;
    const shopeeCom = info.shopeeComFinal ?? 0;
    const price = info.price ?? 0;

    const totalPercent = price > 0 ? (totalCom / price) * 100 : 0;
    const sellerPercent = price > 0 ? (sellerCom / price) * 100 : 0;
    const shopeePercent = price > 0 ? (shopeeCom / price) * 100 : 0;

    return {
      product: {
        itemId: String(info.itemId),
        shopId: shopId ?? "",
        title: info.productName,
        shopName: info.shopName ?? "Shopee Mall",
        priceVnd: price,
        salesCount: info.sales ?? 0,
        ...(info.imageUrl
          ? {
              imageUrl: info.imageUrl.startsWith("http")
                ? info.imageUrl
                : `https://down-vn.img.susercontent.com/file/${info.imageUrl}`
            }
          : {}),
        rating: info.rating ?? "5.0",
        isXtra: info.isXtra ?? false,
        canonicalUrl: canonicalProductUrl,
        trackingUrl: redirectUrl
      },
      commission: {
        totalVnd: totalCom,
        totalPercent: Math.round(totalPercent * 10) / 10,
        sellerVnd: sellerCom,
        sellerPercent: Math.round(sellerPercent * 10) / 10,
        shopeeVnd: shopeeCom,
        shopeePercent: Math.round(shopeePercent * 10) / 10,
        capVnd: info.cap ?? 40000,
        isCapped: info.isCapped ?? false
      }
    };
  } catch {
    return null;
  }
}

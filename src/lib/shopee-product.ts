import { loadServerEnv } from "@/lib/env";
import { parseLosslessJson } from "@/lib/lossless-json";
import { parseVndAmount } from "@/lib/money";
import {
  fetchAllowlistedPlatformUrl,
  parseAllowedUrl,
  readBoundedResponseText
} from "@/modules/connectors/url-policy";
import { z } from "zod";

export interface ShopeeProductResult {
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
    trackingUrl: string;
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

const vndInputSchema = z.union([z.string(), z.number().int().safe()]);
const productPayloadSchema = z.object({
  status: z.literal("success"),
  productInfo: z.object({
    itemId: z.coerce.string(),
    productName: z.string().min(1).max(500),
    shopName: z.string().max(200).optional(),
    price: vndInputSchema,
    sales: z.coerce.number().int().nonnegative().optional(),
    imageUrl: z.string().max(2_000).optional(),
    productLink: z.string().max(4_000).optional(),
    rating: z.union([z.string(), z.coerce.number().finite()]).optional(),
    commission: vndInputSchema.optional(),
    sellerComFinal: vndInputSchema.optional(),
    shopeeComFinal: vndInputSchema.optional(),
    isXtra: z.boolean().optional(),
    isCapped: z.boolean().optional(),
    cap: vndInputSchema.optional()
  })
});

function percentOf(amountVnd: bigint, priceVnd: bigint): number {
  return priceVnd > 0n ? Number((amountVnd * 1_000n) / priceVnd) / 10 : 0;
}

function shopeeImageUrl(input?: string): string | undefined {
  if (!input) return undefined;
  if (!input.startsWith("http")) {
    return `https://down-vn.img.susercontent.com/file/${encodeURIComponent(input)}`;
  }
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (host === "down-vn.img.susercontent.com" || host === "cf.shopee.vn")
    ) {
      return url.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function resolveShopeeShortUrl(shortUrl: string): Promise<string> {
  try {
    const { response: res, finalUrl } = await fetchAllowlistedPlatformUrl(
      shortUrl,
      "SHOPEE_MARKETPLACE",
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
        }
      },
      { maxRedirects: 3, timeoutMs: 6_000 }
    );
    const finalUrlString = finalUrl.toString();
    const directExtract = extractShopeeIds(finalUrlString);
    if (directExtract.itemId) {
      return finalUrlString;
    }

    // Parse HTML body for embedded target URLs (e.g. var CONFIG = { httpUrl: "..." })
    const html = await readBoundedResponseText(res, 512_000);
    const configMatch =
      html.match(/httpUrl\s*:\s*["']([^"']+)["']/i) ||
      html.match(/deepLinkUrl\s*:\s*["']([^"']+)["']/i);

    if (configMatch?.[1]) {
      return parseAllowedUrl(
        configMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, ""),
        "SHOPEE_MARKETPLACE"
      ).toString();
    }

    const idMatch = html.match(/\/(?:product\/)?(\d+)\/(\d+)/) || html.match(/-i\.(\d+)\.(\d+)/);
    if (idMatch?.[1] && idMatch?.[2]) {
      return `https://shopee.vn/product/${idMatch[1]}/${idMatch[2]}`;
    }

    return finalUrlString;
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
    const { response: res } = await fetchAllowlistedPlatformUrl(
      videoUrl,
      "SHOPEE_MARKETPLACE",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
        }
      },
      { maxRedirects: 3, timeoutMs: 6_000 }
    );
    if (!res.ok) return null;
    const html = await readBoundedResponseText(res, 512_000);

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
    const imageUrl = shopeeImageUrl(imageMatch?.[1]);

    return {
      title: rawTitle,
      shopName,
      ...(imageUrl ? { imageUrl } : {})
    };
  } catch {
    return null;
  }
}

export async function fetchShopeeProductData(
  inputUrl: string
): Promise<ShopeeProductResult | null> {
  const targetUrl = inputUrl.trim();
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
          priceVnd: "0",
          salesCount: 0,
          ...(videoMeta.imageUrl ? { imageUrl: videoMeta.imageUrl } : {}),
          rating: "5.0",
          isXtra: false,
          canonicalUrl: expandedUrl,
          trackingUrl: targetUrl
        },
        commission: {
          totalVnd: "0",
          totalPercent: 0,
          sellerVnd: "0",
          sellerPercent: 0,
          shopeeVnd: "0",
          shopeePercent: 0,
          capVnd: "40000",
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
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) return null;

    const responseText = await readBoundedResponseText(response, 512_000);
    const payload = productPayloadSchema.parse(parseLosslessJson(responseText, 512_000));

    const info = payload.productInfo;
    const affiliateId = env.SHOPEE_AFFILIATE_ID;
    if (!affiliateId) return null;
    const canonicalProductUrl = parseAllowedUrl(
      info.productLink ?? `https://shopee.vn/product/${shopId ?? ""}/${itemId}`,
      "SHOPEE_MARKETPLACE"
    ).toString();
    const redirectUrl = `https://s.shopee.vn/an_redir?origin_link=${encodeURIComponent(canonicalProductUrl)}&affiliate_id=${affiliateId}`;

    const totalCom = parseVndAmount(info.commission ?? "0", "total commission");
    const sellerCom = parseVndAmount(info.sellerComFinal ?? "0", "seller commission");
    const shopeeCom = parseVndAmount(info.shopeeComFinal ?? "0", "Shopee commission");
    const price = parseVndAmount(info.price, "product price");
    const cap = parseVndAmount(info.cap ?? "40000", "commission cap");
    const productImageUrl = shopeeImageUrl(info.imageUrl);

    return {
      product: {
        itemId: String(info.itemId),
        shopId: shopId ?? "",
        title: info.productName,
        shopName: info.shopName ?? "Shopee Mall",
        priceVnd: price.toString(),
        salesCount: info.sales ?? 0,
        ...(productImageUrl ? { imageUrl: productImageUrl } : {}),
        rating: String(info.rating ?? "5.0"),
        isXtra: info.isXtra ?? false,
        canonicalUrl: canonicalProductUrl,
        trackingUrl: redirectUrl
      },
      commission: {
        totalVnd: totalCom.toString(),
        totalPercent: percentOf(totalCom, price),
        sellerVnd: sellerCom.toString(),
        sellerPercent: percentOf(sellerCom, price),
        shopeeVnd: shopeeCom.toString(),
        shopeePercent: percentOf(shopeeCom, price),
        capVnd: cap.toString(),
        isCapped: info.isCapped ?? false
      }
    };
  } catch {
    return null;
  }
}

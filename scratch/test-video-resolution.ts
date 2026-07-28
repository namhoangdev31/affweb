import { resolveShopeeShortUrl } from "../src/lib/shopee-product";

export async function parseShopeeVideoPage(videoUrl: string): Promise<{
  title: string;
  shopName: string;
  imageUrl?: string;
  isShopeeVideo: true;
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
    // Strip trailing '| 2 likes ...' if present
    rawTitle = rawTitle.replace(/\|.*$/i, "").trim();

    let shopName = "Shopee Video Creator";
    if (titleMatch?.[1] && titleMatch[1].includes(" on Shopee Video")) {
      shopName = titleMatch[1].replace(" on Shopee Video", "").trim();
    }

    return {
      title: rawTitle,
      shopName,
      ...(imageMatch?.[1] ? { imageUrl: imageMatch[1] } : {}),
      isShopeeVideo: true
    };
  } catch {
    return null;
  }
}

async function run() {
  const shortUrl = "https://vn.shp.ee/tjhvflhj?smtt=0.0.9";
  const resolved = await resolveShopeeShortUrl(shortUrl);
  console.log("Resolved URL:", resolved);

  const videoMeta = await parseShopeeVideoPage(resolved);
  console.log("Extracted Video Metadata:", JSON.stringify(videoMeta, null, 2));
}

run();

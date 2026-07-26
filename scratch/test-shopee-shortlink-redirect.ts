import { extractShopeeIds } from "../src/lib/shopee-product";

export async function resolveShopeeShortUrlWithHtmlFallback(shortUrl: string): Promise<string> {
  try {
    const res = await fetch(shortUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
      },
      signal: AbortSignal.timeout(6000)
    });

    const finalUrl = res.url;
    const directExtract = extractShopeeIds(finalUrl);
    if (directExtract.itemId) {
      return finalUrl;
    }

    // Parse HTML body for embedded target URLs (e.g. var CONFIG = { httpUrl: "..." })
    const html = await res.text();
    const configMatch = html.match(/httpUrl\s*:\s*["']([^"']+)["']/i) || html.match(/deepLinkUrl\s*:\s*["']([^"']+)["']/i);

    if (configMatch?.[1]) {
      const unescaped = configMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
      console.log("Found unescaped URL in CONFIG:", unescaped);
      return unescaped;
    }

    // Secondary regex match for /shopId/itemId in HTML
    const idMatch = html.match(/\/(?:product\/)?(\d+)\/(\d+)/) || html.match(/-i\.(\d+)\.(\d+)/);
    if (idMatch?.[1] && idMatch?.[2]) {
      return `https://shopee.vn/product/${idMatch[1]}/${idMatch[2]}`;
    }

    return finalUrl;
  } catch {
    return shortUrl;
  }
}

async function run() {
  const shortUrl = "https://s.shopee.vn/4qELti2CFY";
  const expanded = await resolveShopeeShortUrlWithHtmlFallback(shortUrl);
  console.log("Expanded URL:", expanded);
  const ids = extractShopeeIds(expanded);
  console.log("Extracted IDs:", ids);
}

run();

import type { Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";

const PLATFORM_HOSTS: Record<Platform, readonly string[]> = {
  SHOPEE_MARKETPLACE: ["shopee.vn", "s.shopee.vn", "vn.shp.ee", "shp.ee", "sv.shopee.vn"],
  SHOPEE_FOOD: ["shopeefood.vn", "now.vn"],
  LAZADA: ["lazada.vn", "s.lazada.vn", "c.lazada.vn"],
  ACCESSTRADE: []
};

const TRACKING_PARAMETERS = new Set([
  "af_click_lookback",
  "af_reengagement_window",
  "af_siteid",
  "af_sub_siteid",
  "af_viewthrough_lookback",
  "atnct1",
  "atnct2",
  "atnct3",
  "c",
  "is_retargeting",
  "pid",
  "referer",
  "smtt",
  "sp_atk",
  "sub_aff_id",
  "sub_id",
  "subid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term"
]);

const DETECTABLE_HOSTS = [
  "shopee.vn",
  "shp.ee",
  "lazada.vn",
  "accesstrade.vn",
  "isclix.com",
  "accesstrade.me"
] as const;

function supportedDetectionHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return DETECTABLE_HOSTS.some((root) => host === root || host.endsWith(`.${root}`));
}

export function cleanProviderUrl(input: string, platform: Platform): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new AppError("VALIDATION_ERROR", "URL không hợp lệ.", 400);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !PLATFORM_HOSTS[platform].some((root) => host === root || host.endsWith(`.${root}`))
  ) {
    throw new AppError("VALIDATION_ERROR", "URL không thuộc provider được hỗ trợ.", 400);
  }
  if (platform === "SHOPEE_MARKETPLACE") {
    const productPath = url.pathname.match(/\/(?:product\/|[^/]+\/)?(\d+)\/(\d+)(?:\/|$)/);
    if (productPath) {
      return `https://shopee.vn/product/${productPath[1]}/${productPath[2]}`;
    }
    const legacyPath = url.pathname.match(/i\.(\d+)\.(\d+)(?:\/|$)/);
    if (legacyPath) {
      return `https://shopee.vn/product/${legacyPath[1]}/${legacyPath[2]}`;
    }
  }
  for (const key of Array.from(url.searchParams.keys())) {
    const normalized = key.toLowerCase();
    if (
      TRACKING_PARAMETERS.has(normalized) ||
      normalized.startsWith("utm_") ||
      /^sub_?id[1-6]$/.test(normalized)
    ) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  return url.toString();
}

export function detectAffiliateIdentifiers(input: string): Array<{
  provider: "SHOPEE" | "LAZADA" | "ACCESSTRADE";
  field: string;
  value: string;
  verified: false;
}> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("VALIDATION_ERROR", "URL không hợp lệ.", 400);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !supportedDetectionHost(url.hostname)
  ) {
    throw new AppError("VALIDATION_ERROR", "URL không thuộc provider được hỗ trợ.", 400);
  }
  const result: Array<{
    provider: "SHOPEE" | "LAZADA" | "ACCESSTRADE";
    field: string;
    value: string;
    verified: false;
  }> = [];
  const candidates = [
    ["SHOPEE", "af_siteid", url.searchParams.get("af_siteid")],
    ["SHOPEE", "af_sub_siteid", url.searchParams.get("af_sub_siteid")],
    ["LAZADA", "sub_aff_id", url.searchParams.get("sub_aff_id")],
    ["LAZADA", "subAffId", url.searchParams.get("subAffId")],
    ["ACCESSTRADE", "utm_source", url.searchParams.get("utm_source")]
  ] as const;
  for (const [provider, field, value] of candidates) {
    if (value && value.length <= 200) {
      result.push({ provider, field, value, verified: false });
    }
  }
  if (/^(?:[^.]+\.)?isclix\.com$/.test(url.hostname.toLowerCase())) {
    const pathCandidate = url.pathname.match(/^\/deep_link\/([^/]+)/)?.[1];
    if (pathCandidate && pathCandidate.length <= 200) {
      result.push({
        provider: "ACCESSTRADE",
        field: "deep_link_path_candidate",
        value: pathCandidate,
        verified: false
      });
    }
  }
  return result;
}

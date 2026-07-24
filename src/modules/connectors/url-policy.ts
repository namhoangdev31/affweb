import type { AffiliateTargetType, Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";

const PLATFORM_HOSTS: Record<Platform, readonly string[]> = {
  SHOPEE_MARKETPLACE: ["shopee.vn", "s.shopee.vn"],
  SHOPEE_FOOD: ["shopeefood.vn", "now.vn"],
  LAZADA: ["lazada.vn", "s.lazada.vn"],
  ACCESSTRADE: []
};

const BLOCKED_IPV4 =
  /^(?:0\.|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|224\.|240\.)/;

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function isAllowedHost(hostname: string, roots: readonly string[]): boolean {
  const host = normalizeHost(hostname);
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

export function parseAllowedUrl(input: string, platform: Platform): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new AppError("VALIDATION_ERROR", "URL không hợp lệ.", 400);
  }

  if (url.protocol !== "https:") {
    throw new AppError("VALIDATION_ERROR", "Chỉ chấp nhận URL HTTPS.", 400);
  }
  if (url.username || url.password || url.port) {
    throw new AppError("VALIDATION_ERROR", "URL không được chứa credential hoặc port.", 400);
  }
  const host = normalizeHost(url.hostname);
  if (
    host === "localhost" ||
    host === "::1" ||
    BLOCKED_IPV4.test(host) ||
    !isAllowedHost(host, PLATFORM_HOSTS[platform])
  ) {
    throw new AppError("VALIDATION_ERROR", "Tên miền không thuộc đối tác được hỗ trợ.", 400);
  }
  url.hash = "";
  return url;
}

export function parseAllowlistedExternalUrl(input: string, roots: readonly string[]): URL {
  if (roots.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Campaign chưa cấu hình tên miền đích.", 400);
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new AppError("VALIDATION_ERROR", "URL không hợp lệ.", 400);
  }
  const host = normalizeHost(url.hostname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    host === "localhost" ||
    host === "::1" ||
    BLOCKED_IPV4.test(host) ||
    !isAllowedHost(host, roots.map(normalizeHost))
  ) {
    throw new AppError("VALIDATION_ERROR", "URL không thuộc allowlist của campaign.", 400);
  }
  url.hash = "";
  return url;
}

export function inferPlatform(input: string): Platform {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new AppError("VALIDATION_ERROR", "URL không hợp lệ.", 400);
  }
  const host = normalizeHost(url.hostname);
  for (const [platform, hosts] of Object.entries(PLATFORM_HOSTS) as Array<
    [Platform, readonly string[]]
  >) {
    if (isAllowedHost(host, hosts)) return platform;
  }
  throw new AppError("VALIDATION_ERROR", "Liên kết này chưa được hỗ trợ.", 400);
}

export function inferTargetType(url: URL, platform: Platform): AffiliateTargetType {
  const path = url.pathname.toLowerCase();
  if (platform === "SHOPEE_FOOD") {
    if (/\/(?:restaurant|delivery)\//.test(path)) return "RESTAURANT";
    if (/\/(?:item|dish|menu)\//.test(path)) return "ITEM";
    return "HOME";
  }
  if (platform === "SHOPEE_MARKETPLACE") {
    if (/\/product\/|i\.\d+\.\d+/.test(path)) return "PRODUCT";
    if (/\/(?:shop|universal-link)\//.test(path)) return "SHOP";
    return "CAMPAIGN";
  }
  if (platform === "LAZADA") {
    if (/\/products\/|-\bi\d+-s\d+\.html$/.test(path)) return "PRODUCT";
    return "CAMPAIGN";
  }
  return "OFFER";
}

export function assertSafeSameOriginDeepLink(input: string): string {
  if (!input.startsWith("/") || input.startsWith("//") || input.includes("\\")) {
    throw new AppError("VALIDATION_ERROR", "Deep link không hợp lệ.", 400);
  }
  return input;
}

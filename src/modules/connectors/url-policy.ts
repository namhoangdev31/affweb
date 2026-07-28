import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { AffiliateTargetType, Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";

const PLATFORM_HOSTS: Record<Platform, readonly string[]> = {
  SHOPEE_MARKETPLACE: ["shopee.vn", "s.shopee.vn", "vn.shp.ee", "shp.ee", "sv.shopee.vn"],
  SHOPEE_FOOD: ["shopeefood.vn", "now.vn"],
  LAZADA: ["lazada.vn", "s.lazada.vn", "c.lazada.vn"],
  ACCESSTRADE: []
};

const BLOCKED_IPV4 =
  /^(?:0\.|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|224\.|240\.)/;

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (isIP(normalized) === 4) return BLOCKED_IPV4.test(normalized);
  if (isIP(normalized) !== 6) return true;
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? BLOCKED_IPV4.test(mappedIpv4) : false;
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function isAllowedHost(hostname: string, roots: readonly string[]): boolean {
  const host = normalizeHost(hostname);
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

async function assertPublicDns(hostname: string): Promise<void> {
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError("VALIDATION_ERROR", "Không phân giải được tên miền đối tác.", 400);
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new AppError("VALIDATION_ERROR", "Tên miền đối tác trỏ tới địa chỉ không an toàn.", 400);
  }
}

export async function fetchAllowlistedPlatformUrl(
  input: string,
  platform: Platform,
  init: RequestInit = {},
  options: { maxRedirects?: number; timeoutMs?: number } = {}
): Promise<{ response: Response; finalUrl: URL }> {
  const maxRedirects = options.maxRedirects ?? 3;
  let current = parseAllowedUrl(input, platform);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicDns(current.hostname);
    const response = await fetch(current, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 6_000)
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current };
    }
    const location = response.headers.get("location");
    if (!location || hop === maxRedirects) {
      throw new AppError("VALIDATION_ERROR", "Redirect đối tác không hợp lệ.", 400);
    }
    current = parseAllowedUrl(new URL(location, current).toString(), platform);
  }
  throw new AppError("VALIDATION_ERROR", "Quá nhiều redirect đối tác.", 400);
}

export async function readBoundedResponseText(
  response: Response,
  maxBytes: number
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) {
    throw new AppError("VALIDATION_ERROR", "Phản hồi đối tác vượt giới hạn.", 400);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError("VALIDATION_ERROR", "Phản hồi đối tác vượt giới hạn.", 400);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
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
  if (platform === "SHOPEE_MARKETPLACE") {
    const matchPath = url.pathname.match(/\/(?:product\/|[^\/]+\/)?(\d+)\/(\d+)(?:\?|$)/);
    if (matchPath) {
      return new URL(`https://shopee.vn/product/${matchPath[1]}/${matchPath[2]}`);
    }
    const matchI = url.pathname.match(/i\.(\d+)\.(\d+)(?:\?|$)/);
    if (matchI) {
      return new URL(`https://shopee.vn/product/${matchI[1]}/${matchI[2]}`);
    }
  }
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

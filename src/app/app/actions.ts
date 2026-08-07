"use server";

import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import { stableHash } from "@/lib/crypto";
import { createAffiliateLink } from "@/modules/links/service";
import { fetchShopeeProductData } from "@/lib/shopee-product";
import { fetchAllowlistedPlatformUrl, inferPlatform } from "@/modules/connectors/url-policy";
import { cleanProviderUrl } from "@/modules/tools/link-inspector";

const linkInputSchema = z.object({
  url: z.url(),
  campaignId: z.string().cuid().optional(),
  affiliateAccountId: z.string().cuid().optional(),
  provider: z.enum(["SHOPEE_DIRECT", "LAZADA_OPEN_API", "ACCESSTRADE_API"]).optional(),
  idempotencyKey: z.string().optional()
});

export async function createAffiliateLinkAction(rawInput: unknown) {
  const user = await requireUser();
  const limit = await rateLimit(`links:${user.id}`, 20, 60);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Bạn tạo link quá nhanh.", 429);
  }

  const input = linkInputSchema.parse(rawInput);
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const requestHash = stableHash(JSON.stringify(input));

  const result = await createAffiliateLink({
    userId: user.id,
    url: input.url,
    campaignId: input.campaignId,
    affiliateAccountId: input.affiliateAccountId,
    provider: input.provider,
    clientIdempotencyKey: idempotencyKey,
    requestHash
  });

  return jsonSafe(result);
}

export async function fetchShopeeProductAction(url: string) {
  await requireUser();
  const data = await fetchShopeeProductData(url);
  if (!data) {
    throw new AppError(
      "NOT_FOUND",
      "Không bóc tách được thông tin sản phẩm Shopee từ liên kết này. Vui lòng thử dùng liên kết gốc hoặc liên kết sản phẩm đầy đủ.",
      404
    );
  }
  return jsonSafe({ ok: true, ...data });
}

const SHORT_HOSTS = new Set(["s.shopee.vn", "vn.shp.ee", "shp.ee", "s.lazada.vn", "c.lazada.vn"]);

export async function cleanLinkAction(inputUrl: string) {
  const user = await requireUser();
  const limit = await rateLimit(`tool-clean-link:${user.id}`, 20, 60);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Bạn dùng Clean Link quá nhanh.", 429);
  }

  const url = z.url().max(4096).parse(inputUrl);
  const platform = inferPlatform(url);
  const original = new URL(url);
  let resolvedUrl = url;

  if (SHORT_HOSTS.has(original.hostname.toLowerCase())) {
    const resolved = await fetchAllowlistedPlatformUrl(url, platform, {
      headers: { Accept: "text/html" }
    });
    await resolved.response.body?.cancel();
    resolvedUrl = resolved.finalUrl.toString();
  }

  return {
    platform,
    cleanUrl: cleanProviderUrl(resolvedUrl, platform)
  };
}

const subscriptionSchema = z.object({
  endpoint: z.url().refine((val) => val.startsWith("https://"), "Push endpoint must use HTTPS."),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256)
  })
});

export async function savePushSubscriptionAction(rawInput: unknown, userAgent?: string) {
  const user = await requireUser();
  const input = subscriptionSchema.parse(rawInput);
  const ua = userAgent ?? null;

  await db.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: ua
    },
    update: {
      userId: user.id,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: ua
    }
  });
}

export async function deletePushSubscriptionAction(endpoint: string) {
  const user = await requireUser();
  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: user.id }
  });
}

import "server-only";

import { randomBytes } from "node:crypto";
import type { Platform, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { connectorFor } from "@/modules/connectors/registry";
import { inferPlatform, parseAllowlistedExternalUrl } from "@/modules/connectors/url-policy";
import { resolveCommissionRate } from "@/modules/rates/service";
import { featureEnabled } from "@/modules/flags/service";
import { fetchShopeeProductData, type ShopeeProductResult } from "@/lib/shopee-product";
import { cashbackFromCommission, tenantCashbackFromCommission } from "@/lib/money";
import { resolveTenantLinkPolicy } from "@/modules/links/tenant-policy";

function createClickToken(): string {
  return randomBytes(18).toString("base64url");
}

type PublicShopeeProduct = Omit<ShopeeProductResult["product"], "trackingUrl">;

function toPublicShopeeProduct(product: ShopeeProductResult["product"]): PublicShopeeProduct {
  return {
    itemId: product.itemId,
    shopId: product.shopId,
    title: product.title,
    shopName: product.shopName,
    priceVnd: product.priceVnd,
    salesCount: product.salesCount,
    ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
    rating: product.rating,
    isXtra: product.isXtra,
    canonicalUrl: product.canonicalUrl
  };
}

export async function createAffiliateLink(input: {
  userId: string;
  url: string;
  campaignId?: string | undefined;
}): Promise<{
  clickToken: string;
  redirectUrl: string;
  platform: Platform;
  cashbackEnabled: boolean;
  cashbackRateBps: number;
  withholdingTaxBps: number;
  estimatedCashbackVnd?: bigint | undefined;
  product?: PublicShopeeProduct | undefined;
  commission?: ShopeeProductResult["commission"] | undefined;
}> {
  const selectedCampaign = input.campaignId
    ? await db.campaign.findFirst({
        where: { id: input.campaignId, active: true, merchant: { active: true } },
        include: { merchant: true }
      })
    : null;
  if (input.campaignId && !selectedCampaign) {
    throw new AppError("NOT_FOUND", "Campaign không tồn tại hoặc đã tắt.", 404);
  }
  const platform = selectedCampaign?.merchant.platform ?? inferPlatform(input.url);
  const flagKey = {
    SHOPEE_MARKETPLACE: "connector.shopee.enabled",
    SHOPEE_FOOD: "connector.shopee_food.enabled",
    LAZADA: "connector.lazada.enabled",
    ACCESSTRADE: "connector.accesstrade.enabled"
  }[platform];
  if (!(await featureEnabled(flagKey, true))) {
    throw new AppError("CONNECTOR_DISABLED", "Đối tác này đang tạm dừng.", 503);
  }
  const connector = connectorFor(platform);
  const merchant =
    selectedCampaign?.merchant ??
    (await db.merchant.findFirst({
      where: { platform, active: true },
      orderBy: { createdAt: "asc" }
    }));
  if (!merchant) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Đối tác này chưa được cấu hình.", 503);
  }
  const campaign =
    selectedCampaign ??
    (await db.campaign.findFirst({
      where: { merchantId: merchant.id, active: true },
      orderBy: { createdAt: "asc" }
    }));
  if (platform === "ACCESSTRADE" && !campaign?.externalId) {
    throw new AppError(
      "CONNECTOR_UNAVAILABLE",
      "AccessTrade cần một campaign active có external ID.",
      503
    );
  }
  const normalizedInput =
    platform === "ACCESSTRADE"
      ? parseAllowlistedExternalUrl(
          input.url,
          campaign?.metadata &&
            typeof campaign.metadata === "object" &&
            !Array.isArray(campaign.metadata) &&
            Array.isArray(campaign.metadata.allowedHosts)
            ? campaign.metadata.allowedHosts.filter(
                (host): host is string => typeof host === "string" && host.length > 0
              )
            : []
        ).toString()
      : input.url;
  const target = await connector.normalizeUrl(normalizedInput);
  const clickToken = createClickToken();
  const [user, ownedTenant] = await Promise.all([
    db.user.findUnique({
      where: { id: input.userId },
      select: {
        tenant: {
          select: {
            id: true,
            status: true,
            planExpiresAt: true,
            shopeeAffiliateId: true,
            memberShareBps: true
          }
        }
      }
    }),
    db.tenant.findUnique({
      where: { ownerUserId: input.userId },
      select: { id: true }
    })
  ]);
  if (!user) {
    throw new AppError("NOT_FOUND", "Tài khoản không tồn tại.", 404);
  }
  const tenantPolicy = resolveTenantLinkPolicy({
    userOwnsTenant: Boolean(ownedTenant),
    memberTenant: user.tenant,
    platform
  });
  const cashbackEnabled =
    platform !== "SHOPEE_FOOD" ||
    (loadServerEnv().SHOPEE_FOOD_CASHBACK_ENABLED &&
      (await featureEnabled("connector.shopee_food_cashback", false)));
  const rate = cashbackEnabled
    ? tenantPolicy
      ? {
          shareBps: tenantPolicy.shareBps,
          source: "TENANT_MEMBER_SHARE" as const,
          ruleVersionId: null
        }
      : await resolveCommissionRate({
          userId: input.userId,
          merchantId: merchant.id,
          campaignId: campaign?.id ?? null,
          merchantDefaultShareBps: merchant.defaultShareBps
        })
    : {
        shareBps: 0,
        source: "SHOPEE_FOOD_CASHBACK_DISABLED" as const,
        ruleVersionId: null
      };
  const subIds = [clickToken, input.userId, tenantPolicy?.tenantId ?? "main", "hoantien"];

  const providerLink = await connector.createTrackingLink({
    target,
    clickToken,
    subIds,
    ...(tenantPolicy ? { affiliateId: tenantPolicy.affiliateId } : {}),
    ...(campaign?.externalId ? { campaignExternalId: campaign.externalId } : {})
  });

  // Try fetching Shopee product & commission breakdown automatically
  let productData: ShopeeProductResult | null = null;
  if (
    platform === "SHOPEE_MARKETPLACE" ||
    input.url.toLowerCase().includes("shopee") ||
    input.url.toLowerCase().includes("shp.ee")
  ) {
    productData = await fetchShopeeProductData(input.url);
  }

  await db.affiliateClick.create({
    data: {
      clickToken,
      userId: input.userId,
      merchantId: merchant.id,
      campaignId: campaign?.id ?? null,
      platform,
      targetType: target.targetType,
      originUrl: target.canonicalUrl,
      outboundUrl: providerLink.url,
      subIds,
      tenantId: tenantPolicy?.tenantId ?? null,
      ...(productData
        ? {
            productSnapshot: {
              product: {
                itemId: productData.product.itemId,
                title: productData.product.title,
                shopName: productData.product.shopName,
                priceVnd: productData.product.priceVnd,
                imageUrl: productData.product.imageUrl ?? null
              },
              commission: productData.commission
            } satisfies Prisma.InputJsonValue
          }
        : {}),
      attribution: {
        create: {
          merchantId: merchant.id,
          campaignId: campaign?.id ?? null,
          ruleVersionId: rate.ruleVersionId ?? null,
          shareBps: rate.shareBps,
          snapshot: {
            source: rate.source,
            shareBps: rate.shareBps,
            withholdingTaxBps: tenantPolicy?.withholdingTaxBps ?? 0,
            tenantId: tenantPolicy?.tenantId ?? null,
            settlementMode: tenantPolicy ? "TENANT_ADMIN_EXTERNAL" : "PLATFORM_WALLET",
            cashbackEnabled,
            capturedAt: new Date().toISOString()
          }
        }
      }
    }
  });

  const estimatedCommissionVnd =
    productData && Number.isFinite(productData.commission.totalVnd)
      ? BigInt(Math.max(0, Math.trunc(productData.commission.totalVnd)))
      : null;
  const estimatedCashbackVnd =
    estimatedCommissionVnd === null
      ? undefined
      : tenantPolicy
        ? tenantCashbackFromCommission(
            estimatedCommissionVnd,
            rate.shareBps,
            tenantPolicy.withholdingTaxBps
          ).cashbackVnd
        : cashbackFromCommission(estimatedCommissionVnd, rate.shareBps);

  return {
    clickToken,
    redirectUrl: `/go/${clickToken}`,
    platform,
    cashbackEnabled,
    cashbackRateBps: rate.shareBps,
    withholdingTaxBps: tenantPolicy?.withholdingTaxBps ?? 0,
    ...(estimatedCashbackVnd === undefined ? {} : { estimatedCashbackVnd }),
    ...(productData
      ? {
          product: toPublicShopeeProduct(productData.product),
          commission: productData.commission
        }
      : {})
  };
}

export async function resolveClickRedirect(
  clickToken: string,
  requestContext?: { ipHash?: string; userAgentHash?: string }
): Promise<string> {
  const click = await db.affiliateClick.findUnique({ where: { clickToken } });
  if (!click?.outboundUrl) {
    throw new AppError("NOT_FOUND", "Liên kết không tồn tại hoặc đã hết hạn.", 404);
  }
  const outbound = new URL(click.outboundUrl);
  if (outbound.protocol !== "https:") {
    throw new AppError("INTERNAL_ERROR", "Unsafe outbound link.", 500);
  }
  await db.affiliateClick.update({
    where: { id: click.id },
    data: {
      clickedAt: click.clickedAt ?? new Date(),
      ...(requestContext?.ipHash ? { ipHash: requestContext.ipHash } : {}),
      ...(requestContext?.userAgentHash ? { userAgentHash: requestContext.userAgentHash } : {})
    }
  });
  return outbound.toString();
}

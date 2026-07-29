import "server-only";

import { randomBytes } from "node:crypto";
import {
  AffiliateAttributionMode,
  ConnectorMode,
  ConnectorType,
  type Platform,
  Prisma,
  ProviderAccountScope
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { connectorFor } from "@/modules/connectors/registry";
import { activeProviderCredential } from "@/modules/connectors/provider-credentials";
import { inferPlatform, parseAllowlistedExternalUrl } from "@/modules/connectors/url-policy";
import { resolveCommissionRate } from "@/modules/rates/service";
import { featureEnabled } from "@/modules/flags/service";
import { fetchShopeeProductData, type ShopeeProductResult } from "@/lib/shopee-product";
import { cashbackFromCommission, parseVndAmount, tenantCashbackFromCommission } from "@/lib/money";
import { resolveTenantLinkPolicy } from "@/modules/links/tenant-policy";
import { requireTenantPlan, tenantSubscriptionIsEffective } from "@/modules/tenants/plans";

function createClickToken(): string {
  return randomBytes(18).toString("base64url");
}

function connectorTypeForPlatform(platform: Platform): ConnectorType {
  if (platform === "LAZADA") return ConnectorType.LAZADA_OPEN_API;
  if (platform === "ACCESSTRADE") return ConnectorType.ACCESSTRADE_API;
  return ConnectorType.SHOPEE_DIRECT;
}

function connectorEntitlement(platform: Platform): string {
  if (platform === "LAZADA") return "LAZADA_OPEN_API";
  if (platform === "ACCESSTRADE") return "ACCESSTRADE_API";
  return "SHOPEE_DIRECT";
}

async function resolveLinkAccount(input: {
  platform: Platform;
  requestedAccountId?: string;
  tenantId?: string;
  tenantAffiliateId?: string;
}) {
  const connectorType = connectorTypeForPlatform(input.platform);
  if (input.requestedAccountId) {
    const requested = await db.affiliateAccount.findUnique({
      where: { id: input.requestedAccountId },
      include: { connectorConfigs: { include: { health: true } } }
    });
    const expectedScope = input.tenantId
      ? ProviderAccountScope.TENANT_MANAGED
      : ProviderAccountScope.PLATFORM_MANAGED;
    if (
      !requested ||
      !requested.enabled ||
      requested.connectorType !== connectorType ||
      requested.platform !== input.platform ||
      requested.scope !== expectedScope ||
      (input.tenantId ? requested.tenantId !== input.tenantId : requested.tenantId !== null)
    ) {
      throw new AppError("FORBIDDEN", "Provider account không hợp lệ cho link này.", 403);
    }
    return requested;
  }
  if (input.tenantId && input.platform === "SHOPEE_MARKETPLACE") {
    if (!input.tenantAffiliateId) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "Tenant chưa cấu hình Affiliate ID.", 503);
    }
    const existing = await db.affiliateAccount.findUnique({
      where: {
        connectorType_platform_externalAccountId: {
          connectorType,
          platform: input.platform,
          externalAccountId: input.tenantAffiliateId
        }
      },
      include: { connectorConfigs: { include: { health: true } } }
    });
    if (existing) {
      if (
        existing.scope !== ProviderAccountScope.TENANT_MANAGED ||
        existing.tenantId !== input.tenantId
      ) {
        throw new AppError(
          "CONFLICT",
          "Affiliate ID này đã được liên kết với provider account khác.",
          409
        );
      }
      return existing;
    }
    return db.affiliateAccount.create({
      data: {
        connectorType,
        platform: input.platform,
        externalAccountId: input.tenantAffiliateId,
        label: "Shopee tenant-managed",
        scope: ProviderAccountScope.TENANT_MANAGED,
        tenantId: input.tenantId,
        connectorConfigs: {
          create: {
            connectorType,
            platform: input.platform,
            tenantId: input.tenantId,
            enabled: true,
            mode: ConnectorMode.ACTIVE
          }
        }
      },
      include: { connectorConfigs: { include: { health: true } } }
    });
  }
  const account = await db.affiliateAccount.findFirst({
    where: {
      connectorType,
      platform: input.platform,
      scope: input.tenantId
        ? ProviderAccountScope.TENANT_MANAGED
        : ProviderAccountScope.PLATFORM_MANAGED,
      tenantId: input.tenantId ?? null,
      enabled: true
    },
    include: { connectorConfigs: { include: { health: true } } },
    orderBy: { createdAt: "asc" }
  });
  if (!account) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Provider account chưa được cấu hình.", 503);
  }
  return account;
}

type PublicShopeeProduct = Omit<ShopeeProductResult["product"], "trackingUrl">;

type ExistingIdempotentClick = {
  clickToken: string;
  platform: Platform;
  requestHash: string | null;
  attribution: {
    shareBps: number;
    snapshot: Prisma.JsonValue;
  } | null;
};

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

function existingClickResult(existing: ExistingIdempotentClick, requestHash?: string) {
  if (existing.requestHash !== requestHash) {
    throw new AppError("CONFLICT", "Idempotency-Key đã được dùng với dữ liệu khác.", 409);
  }
  const snapshot =
    existing.attribution?.snapshot &&
    typeof existing.attribution.snapshot === "object" &&
    !Array.isArray(existing.attribution.snapshot)
      ? existing.attribution.snapshot
      : {};
  return {
    clickToken: existing.clickToken,
    redirectUrl: `/go/${existing.clickToken}`,
    platform: existing.platform,
    cashbackEnabled: snapshot.cashbackEnabled !== false,
    cashbackRateBps: existing.attribution?.shareBps ?? 0,
    withholdingTaxBps:
      typeof snapshot.withholdingTaxBps === "number" ? snapshot.withholdingTaxBps : 0
  };
}

export async function createAffiliateLink(input: {
  userId: string;
  url: string;
  campaignId?: string | undefined;
  affiliateAccountId?: string | undefined;
  provider?: "SHOPEE_DIRECT" | "LAZADA_OPEN_API" | "ACCESSTRADE_API" | undefined;
  clientIdempotencyKey?: string | undefined;
  requestHash?: string | undefined;
  tenantChannelId?: string | undefined;
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
  if (input.clientIdempotencyKey) {
    const existing = await db.affiliateClick.findFirst({
      where: {
        userId: input.userId,
        clientIdempotencyKey: input.clientIdempotencyKey
      },
      include: { attribution: true }
    });
    if (existing) {
      return existingClickResult(existing, input.requestHash);
    }
  }
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
  if (input.provider && input.provider !== connectorTypeForPlatform(platform)) {
    throw new AppError("VALIDATION_ERROR", "Provider không khớp URL/campaign đã chọn.", 400);
  }
  if (platform === "ACCESSTRADE" && !input.campaignId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "AccessTrade chỉ được dùng khi chọn campaign rõ ràng.",
      400
    );
  }
  const flagKey = {
    SHOPEE_MARKETPLACE: "connector.shopee.enabled",
    SHOPEE_FOOD: "connector.shopee_food.enabled",
    LAZADA: "connector.lazada.enabled",
    ACCESSTRADE: "connector.accesstrade.enabled"
  }[platform];
  const defaultEnabled = platform === "SHOPEE_MARKETPLACE" || platform === "SHOPEE_FOOD";
  if (!(await featureEnabled(flagKey, defaultEnabled))) {
    throw new AppError("CONNECTOR_DISABLED", "Đối tác này đang tạm dừng.", 503);
  }
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
            memberShareBps: true,
            planId: true,
            planCode: true
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
  let tenantPolicy = resolveTenantLinkPolicy({
    userOwnsTenant: Boolean(ownedTenant),
    memberTenant: user.tenant,
    platform
  });
  let attributionMode: AffiliateAttributionMode = tenantPolicy
    ? AffiliateAttributionMode.TENANT_MEMBER
    : AffiliateAttributionMode.PLATFORM_USER;
  if (input.tenantChannelId) {
    const channelTenant = await db.tenant.findUnique({
      where: { id: input.tenantChannelId },
      select: {
        id: true,
        ownerUserId: true,
        status: true,
        planExpiresAt: true,
        planId: true,
        planCode: true,
        shopeeAffiliateId: true
      }
    });
    if (
      !channelTenant ||
      channelTenant.ownerUserId !== input.userId ||
      !tenantSubscriptionIsEffective(channelTenant) ||
      (platform === "SHOPEE_MARKETPLACE" && !channelTenant.shopeeAffiliateId)
    ) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "Kênh tenant chưa sẵn sàng tạo link.", 503);
    }
    const channelPlan = await requireTenantPlan(channelTenant.planCode ?? channelTenant.planId);
    if (
      !channelPlan.allowZaloBot ||
      !channelPlan.allowedConnectors.includes(connectorEntitlement(platform))
    ) {
      throw new AppError("CONNECTOR_DISABLED", "Gói tenant không hỗ trợ kênh Zalo.", 403);
    }
    tenantPolicy = {
      tenantId: channelTenant.id,
      ...(channelTenant.shopeeAffiliateId ? { affiliateId: channelTenant.shopeeAffiliateId } : {}),
      shareBps: 0,
      withholdingTaxBps: 0
    };
    attributionMode = AffiliateAttributionMode.TENANT_CHANNEL;
  } else if (tenantPolicy && user.tenant) {
    const memberPlan = await requireTenantPlan(user.tenant.planCode ?? user.tenant.planId);
    if (!memberPlan.allowedConnectors.includes(connectorEntitlement(platform))) {
      throw new AppError("CONNECTOR_DISABLED", "Gói tenant không hỗ trợ đối tác này.", 403);
    }
  }
  const affiliateAccount = await resolveLinkAccount({
    platform,
    ...(input.affiliateAccountId ? { requestedAccountId: input.affiliateAccountId } : {}),
    ...(tenantPolicy
      ? {
          tenantId: tenantPolicy.tenantId,
          ...(tenantPolicy.affiliateId ? { tenantAffiliateId: tenantPolicy.affiliateId } : {})
        }
      : {})
  });
  if (platform === "LAZADA" || platform === "ACCESSTRADE") {
    const config = affiliateAccount.connectorConfigs.find(
      (candidate) =>
        candidate.connectorType === connectorTypeForPlatform(platform) &&
        candidate.mode === ConnectorMode.ACTIVE &&
        candidate.enabled
    );
    if (
      !config ||
      !affiliateAccount.verifiedAt ||
      affiliateAccount.validationHoldDays === null ||
      affiliateAccount.validationHoldDays < 4 ||
      affiliateAccount.validationHoldDays > 60
    ) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        "Provider account chưa qua preflight hoặc chưa cấu hình validation hold.",
        503
      );
    }
  }
  const credential =
    platform === "LAZADA" || platform === "ACCESSTRADE"
      ? await activeProviderCredential(affiliateAccount.id)
      : null;
  if (
    affiliateAccount.scope === ProviderAccountScope.TENANT_MANAGED &&
    (platform === "LAZADA" || platform === "ACCESSTRADE") &&
    !credential
  ) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Tenant credential chưa được xác minh.", 503);
  }
  const connector = connectorFor(platform, credential ?? undefined);
  const target = await connector.normalizeUrl(normalizedInput);
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
    ...(tenantPolicy?.affiliateId ? { affiliateId: tenantPolicy.affiliateId } : {}),
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

  const createClick = (client: Prisma.TransactionClient | typeof db) =>
    client.affiliateClick.create({
      data: {
        clickToken,
        userId: input.userId,
        merchantId: merchant.id,
        campaignId: campaign?.id ?? null,
        affiliateAccountId: affiliateAccount.id,
        platform,
        targetType: target.targetType,
        originUrl: target.canonicalUrl,
        outboundUrl: providerLink.url,
        subIds,
        tenantId: tenantPolicy?.tenantId ?? null,
        attributionMode,
        clientIdempotencyKey: input.clientIdempotencyKey ?? null,
        requestHash: input.requestHash ?? null,
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
                commission: {
                  ...productData.commission,
                  totalVnd: productData.commission.totalVnd,
                  sellerVnd: productData.commission.sellerVnd,
                  shopeeVnd: productData.commission.shopeeVnd,
                  capVnd: productData.commission.capVnd
                }
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
              attributionMode,
              settlementMode:
                attributionMode === AffiliateAttributionMode.TENANT_CHANNEL
                  ? "TENANT_CHANNEL_OWNER_DIRECT"
                  : tenantPolicy
                    ? "TENANT_ADMIN_EXTERNAL"
                    : "PLATFORM_WALLET",
              cashbackEnabled,
              capturedAt: new Date().toISOString()
            }
          }
        }
      }
    });

  try {
    if (tenantPolicy) {
      await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`
          SELECT id FROM "Tenant" WHERE id = ${tenantPolicy.tenantId} FOR UPDATE
        `;
          const currentTenant = await tx.tenant.findUniqueOrThrow({
            where: { id: tenantPolicy.tenantId }
          });
          if (!tenantSubscriptionIsEffective(currentTenant)) {
            throw new AppError("FORBIDDEN", "Gói tenant đã hết hiệu lực.", 403);
          }
          const currentPlan = await requireTenantPlan(
            currentTenant.planCode ?? currentTenant.planId,
            tx
          );
          if (!currentPlan.allowedConnectors.includes(connectorEntitlement(platform))) {
            throw new AppError("CONNECTOR_DISABLED", "Gói tenant không hỗ trợ đối tác này.", 403);
          }
          await createClick(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } else {
      await createClick(db);
    }
  } catch (error) {
    const retryable =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034");
    if (!retryable || !input.clientIdempotencyKey) throw error;
    const existing = await db.affiliateClick.findFirst({
      where: {
        userId: input.userId,
        clientIdempotencyKey: input.clientIdempotencyKey
      },
      include: { attribution: true }
    });
    if (!existing) throw error;
    return existingClickResult(existing, input.requestHash);
  }

  const estimatedCommissionVnd = productData
    ? parseVndAmount(productData.commission.totalVnd, "estimated commission")
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

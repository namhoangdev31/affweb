import type { Platform, TenantKind, TenantStatus } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { TENANT_AFFILIATE_TAX_BPS } from "@/lib/money";

export type TenantLinkConfig = {
  id: string;
  kind: TenantKind;
  status: TenantStatus;
  planExpiresAt: Date;
  shopeeAffiliateId: string | null;
  memberShareBps: number | null;
};

export function resolveTenantLinkPolicy(input: {
  userOwnsTenant: boolean;
  memberTenant: TenantLinkConfig | null;
  platform: Platform;
  now?: Date;
}): {
  tenantId: string;
  affiliateId?: string;
  shareBps: number;
  withholdingTaxBps: number;
} | null {
  if (!input.memberTenant) return null;
  if (input.userOwnsTenant && input.memberTenant.kind !== "MASTER") {
    throw new AppError("FORBIDDEN", "Tenant owner phải giữ membership tại Platform Tenant.", 403);
  }

  const tenant = input.memberTenant;
  const subscriptionActive =
    (tenant.status === "TRIAL" || tenant.status === "ACTIVE") &&
    tenant.planExpiresAt.getTime() > (input.now ?? new Date()).getTime();
  if (!subscriptionActive) {
    throw new AppError("FORBIDDEN", "Gói dịch vụ của nhóm đã hết hạn hoặc đang tạm dừng.", 403);
  }
  if (tenant.memberShareBps === null) {
    throw new AppError(
      "CONNECTOR_UNAVAILABLE",
      "Admin nhóm chưa cấu hình tỷ lệ hoàn cho member.",
      503
    );
  }
  if (input.platform === "SHOPEE_MARKETPLACE" && !tenant.shopeeAffiliateId) {
    throw new AppError(
      "CONNECTOR_UNAVAILABLE",
      "Admin nhóm chưa cấu hình Shopee Affiliate ID.",
      503
    );
  }

  return {
    tenantId: tenant.id,
    ...(tenant.shopeeAffiliateId ? { affiliateId: tenant.shopeeAffiliateId } : {}),
    shareBps: tenant.memberShareBps,
    withholdingTaxBps: TENANT_AFFILIATE_TAX_BPS
  };
}

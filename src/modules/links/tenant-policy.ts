import type { Platform, TenantStatus } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { TENANT_AFFILIATE_TAX_BPS } from "@/lib/money";

export type TenantLinkConfig = {
  id: string;
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
  affiliateId: string;
  shareBps: number;
  withholdingTaxBps: number;
} | null {
  if (input.userOwnsTenant || !input.memberTenant) return null;

  const tenant = input.memberTenant;
  const subscriptionActive =
    (tenant.status === "TRIAL" || tenant.status === "ACTIVE") &&
    tenant.planExpiresAt.getTime() > (input.now ?? new Date()).getTime();
  if (!subscriptionActive) {
    throw new AppError("FORBIDDEN", "Gói dịch vụ của nhóm đã hết hạn hoặc đang tạm dừng.", 403);
  }
  if (input.platform !== "SHOPEE_MARKETPLACE") {
    throw new AppError(
      "CONNECTOR_UNAVAILABLE",
      "Nhóm hiện chỉ hỗ trợ tạo link bằng Shopee Affiliate ID của admin.",
      503
    );
  }
  if (!tenant.shopeeAffiliateId || tenant.memberShareBps === null) {
    throw new AppError(
      "CONNECTOR_UNAVAILABLE",
      "Admin nhóm chưa hoàn tất Affiliate ID hoặc tỷ lệ hoàn cho member.",
      503
    );
  }

  return {
    tenantId: tenant.id,
    affiliateId: tenant.shopeeAffiliateId,
    shareBps: tenant.memberShareBps,
    withholdingTaxBps: TENANT_AFFILIATE_TAX_BPS
  };
}

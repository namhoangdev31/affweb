import { describe, expect, it } from "vitest";
import { resolveTenantLinkPolicy, type TenantLinkConfig } from "@/modules/links/tenant-policy";

const activeTenant: TenantLinkConfig = {
  id: "tenant-1",
  status: "ACTIVE",
  planExpiresAt: new Date("2026-08-31T00:00:00.000Z"),
  shopeeAffiliateId: "17330520179",
  memberShareBps: 7_000
};

describe("resolveTenantLinkPolicy", () => {
  it("luôn dùng flow nền tảng khi user là owner của một tenant", () => {
    expect(
      resolveTenantLinkPolicy({
        userOwnsTenant: true,
        memberTenant: activeTenant,
        platform: "SHOPEE_MARKETPLACE",
        now: new Date("2026-07-28T00:00:00.000Z")
      })
    ).toBeNull();
  });

  it("dùng Affiliate ID và tỷ lệ riêng cho member tenant", () => {
    expect(
      resolveTenantLinkPolicy({
        userOwnsTenant: false,
        memberTenant: activeTenant,
        platform: "SHOPEE_MARKETPLACE",
        now: new Date("2026-07-28T00:00:00.000Z")
      })
    ).toEqual({
      tenantId: "tenant-1",
      affiliateId: "17330520179",
      shareBps: 7_000,
      withholdingTaxBps: 1_000
    });
  });

  it("dùng tenant share cho Lazada mà không giả định Shopee Affiliate ID", () => {
    expect(
      resolveTenantLinkPolicy({
        userOwnsTenant: false,
        memberTenant: { ...activeTenant, shopeeAffiliateId: null },
        platform: "LAZADA",
        now: new Date("2026-07-28T00:00:00.000Z")
      })
    ).toEqual({
      tenantId: "tenant-1",
      shareBps: 7_000,
      withholdingTaxBps: 1_000
    });
  });

  it("fail-closed khi gói hết hạn hoặc tenant thiếu cấu hình", () => {
    expect(() =>
      resolveTenantLinkPolicy({
        userOwnsTenant: false,
        memberTenant: {
          ...activeTenant,
          planExpiresAt: new Date("2026-07-01T00:00:00.000Z")
        },
        platform: "SHOPEE_MARKETPLACE",
        now: new Date("2026-07-28T00:00:00.000Z")
      })
    ).toThrow("Gói dịch vụ của nhóm");

    expect(() =>
      resolveTenantLinkPolicy({
        userOwnsTenant: false,
        memberTenant: { ...activeTenant, shopeeAffiliateId: null },
        platform: "SHOPEE_MARKETPLACE",
        now: new Date("2026-07-28T00:00:00.000Z")
      })
    ).toThrow("chưa cấu hình");
  });
});

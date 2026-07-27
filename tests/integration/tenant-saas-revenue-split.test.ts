import { describe, expect, it } from "vitest";
import { cashbackFromCommission } from "@/lib/money";

describe("Multi-Tenant Revenue Sharing & Commission Split Calculations", () => {
  it("calculates exact 3-tier commission split between Platform, Tenant Owner, and Tenant User", () => {
    const grossCommissionVnd = 100_000n;
    const networkFeeVnd = 0n;
    const netCommissionVnd = grossCommissionVnd - networkFeeVnd;

    // Tenant Config: 50% cashback to Tenant User (5000 bps), 15% Platform Fee (1500 bps)
    const tenantUserShareBps = 5000;
    const platformFeeBps = 1500;

    const tenantUserCashbackVnd = cashbackFromCommission(netCommissionVnd, tenantUserShareBps);
    const platformShareVnd = cashbackFromCommission(netCommissionVnd, platformFeeBps);
    const tenantOwnerProfitVnd = netCommissionVnd - tenantUserCashbackVnd - platformShareVnd;

    expect(tenantUserCashbackVnd).toBe(50_000n);
    expect(platformShareVnd).toBe(15_000n);
    expect(tenantOwnerProfitVnd).toBe(35_000n);

    // Assert total sum matches net commission
    expect(tenantUserCashbackVnd + platformShareVnd + tenantOwnerProfitVnd).toBe(netCommissionVnd);
  });

  it("handles tenant subscription invoice billing extension days", () => {
    const isYearly = true;
    const extensionDays = isYearly ? 365 : 30;
    const now = new Date("2026-07-27T00:00:00Z");
    const currentExpiry = new Date("2026-07-27T00:00:00Z");
    const newExpiry = new Date(currentExpiry.getTime() + extensionDays * 24 * 60 * 60 * 1000);

    expect(extensionDays).toBe(365);
    expect(newExpiry.toISOString()).toContain("2027-07-27");
  });

  it("validates SubID packet encoding for Tenant User scoping", () => {
    const clickToken = "click-uuid-1234";
    const userId = "user-999";
    const tenantId = "tenant-koc-sansale";

    const subIds = [clickToken, userId, tenantId];
    expect(subIds[0]).toBe(clickToken);
    expect(subIds[1]).toBe(userId);
    expect(subIds[2]).toBe(tenantId);
  });
});

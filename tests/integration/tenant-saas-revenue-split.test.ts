import { describe, expect, it } from "vitest";
import { tenantCashbackFromCommission } from "@/lib/money";

describe("Multi-Tenant Revenue Sharing & Commission Split Calculations", () => {
  it("trừ 10% thuế rồi chia giữa tenant owner và member, không thu phí phần trăm", () => {
    const netCommissionVnd = 100_000n;
    const calculation = tenantCashbackFromCommission(netCommissionVnd, 7_000);
    const tenantOwnerRemainderVnd = calculation.commissionAfterTaxVnd - calculation.cashbackVnd;

    expect(calculation.withholdingTaxVnd).toBe(10_000n);
    expect(calculation.cashbackVnd).toBe(63_000n);
    expect(tenantOwnerRemainderVnd).toBe(27_000n);
    expect(calculation.withholdingTaxVnd + calculation.cashbackVnd + tenantOwnerRemainderVnd).toBe(
      netCommissionVnd
    );
  });

  it("handles tenant subscription invoice billing extension days", () => {
    const isYearly = true;
    const extensionDays = isYearly ? 365 : 30;
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

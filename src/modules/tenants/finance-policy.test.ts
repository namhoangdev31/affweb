import { describe, expect, it } from "vitest";
import { fifoFundingPlan, tenantFinanceGateReady } from "@/modules/tenants/finance-policy";

describe("fifoFundingPlan", () => {
  it("funds complete obligations in FIFO order", () => {
    expect(
      fifoFundingPlan(250n, [
        { id: "first", amountVnd: 100n },
        { id: "second", amountVnd: 150n }
      ])
    ).toEqual({ fundedIds: ["first", "second"], fundedVnd: 250n, remainingVnd: 0n });
  });

  it("does not skip an older obligation that cannot be fully funded", () => {
    expect(
      fifoFundingPlan(120n, [
        { id: "first", amountVnd: 150n },
        { id: "second", amountVnd: 50n }
      ])
    ).toEqual({ fundedIds: [], fundedVnd: 0n, remainingVnd: 120n });
  });

  it("rejects invalid monetary inputs", () => {
    expect(() => fifoFundingPlan(-1n, [])).toThrow();
    expect(() => fifoFundingPlan(10n, [{ id: "bad", amountVnd: 0n }])).toThrow();
  });
});

describe("tenantFinanceGateReady", () => {
  const enabled = {
    envFinance: true,
    envOperation: true,
    globalFinance: true,
    globalOperation: true,
    tenantFinance: true,
    tenantOperation: true
  };

  it("requires every environment, global and tenant gate", () => {
    expect(tenantFinanceGateReady(enabled)).toBe(true);
    for (const key of Object.keys(enabled) as Array<keyof typeof enabled>) {
      expect(tenantFinanceGateReady({ ...enabled, [key]: false })).toBe(false);
    }
  });
});

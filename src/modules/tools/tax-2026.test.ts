import { describe, expect, it } from "vitest";
import {
  calculatePersonalIncomeTax2026,
  PERSONAL_INCOME_TAX_RULE_2026
} from "@/modules/tools/tax-2026";

describe("2026 personal income tax estimate", () => {
  it("uses the versioned 2026 deductions", () => {
    expect(PERSONAL_INCOME_TAX_RULE_2026.selfDeductionVnd).toBe(15_500_000n);
    expect(PERSONAL_INCOME_TAX_RULE_2026.dependentDeductionVnd).toBe(6_200_000n);
  });

  it("returns zero below deductions", () => {
    expect(
      calculatePersonalIncomeTax2026({
        monthlyGrossVnd: 15_000_000n,
        insuranceVnd: 0n,
        dependents: 0
      }).estimatedTaxVnd
    ).toBe(0n);
  });

  it("applies all five progressive brackets with bigint arithmetic", () => {
    const result = calculatePersonalIncomeTax2026({
      monthlyGrossVnd: 140_500_000n,
      insuranceVnd: 0n,
      dependents: 0
    });

    expect(result.taxableIncomeVnd).toBe(125_000_000n);
    expect(result.estimatedTaxVnd).toBe(29_250_000n);
    expect(result.breakdown.map((line) => line.ratePercent)).toEqual([5, 10, 20, 30, 35]);
  });

  it("rejects insurance above gross income", () => {
    expect(() =>
      calculatePersonalIncomeTax2026({
        monthlyGrossVnd: 1n,
        insuranceVnd: 2n,
        dependents: 0
      })
    ).toThrow();
  });
});

export const PERSONAL_INCOME_TAX_RULE_2026 = {
  version: "VN-PIT-109-2025-QH15-2026",
  effectiveFrom: "2026-01-01",
  selfDeductionVnd: 15_500_000n,
  dependentDeductionVnd: 6_200_000n,
  brackets: [
    { upperVnd: 10_000_000n, ratePercent: 5 },
    { upperVnd: 30_000_000n, ratePercent: 10 },
    { upperVnd: 60_000_000n, ratePercent: 20 },
    { upperVnd: 100_000_000n, ratePercent: 30 },
    { upperVnd: null, ratePercent: 35 }
  ]
} as const;

export type PersonalIncomeTaxResult = {
  ruleVersion: string;
  taxableIncomeVnd: bigint;
  estimatedTaxVnd: bigint;
  netAfterTaxVnd: bigint;
  deductionsVnd: bigint;
  breakdown: Array<{
    ratePercent: number;
    taxableVnd: bigint;
    taxVnd: bigint;
  }>;
};

export function calculatePersonalIncomeTax2026(input: {
  monthlyGrossVnd: bigint;
  insuranceVnd: bigint;
  dependents: number;
}): PersonalIncomeTaxResult {
  if (
    input.monthlyGrossVnd < 0n ||
    input.insuranceVnd < 0n ||
    input.insuranceVnd > input.monthlyGrossVnd ||
    !Number.isInteger(input.dependents) ||
    input.dependents < 0 ||
    input.dependents > 100
  ) {
    throw new RangeError("Tax calculator input is invalid.");
  }
  const deductionsVnd =
    input.insuranceVnd +
    PERSONAL_INCOME_TAX_RULE_2026.selfDeductionVnd +
    PERSONAL_INCOME_TAX_RULE_2026.dependentDeductionVnd * BigInt(input.dependents);
  const taxableIncomeVnd =
    input.monthlyGrossVnd > deductionsVnd ? input.monthlyGrossVnd - deductionsVnd : 0n;
  let lowerBound = 0n;
  let estimatedTaxVnd = 0n;
  const breakdown: PersonalIncomeTaxResult["breakdown"] = [];
  for (const bracket of PERSONAL_INCOME_TAX_RULE_2026.brackets) {
    if (taxableIncomeVnd <= lowerBound) break;
    const upperBound = bracket.upperVnd ?? taxableIncomeVnd;
    const taxableVnd =
      taxableIncomeVnd < upperBound ? taxableIncomeVnd - lowerBound : upperBound - lowerBound;
    const taxVnd = (taxableVnd * BigInt(bracket.ratePercent)) / 100n;
    breakdown.push({
      ratePercent: bracket.ratePercent,
      taxableVnd,
      taxVnd
    });
    estimatedTaxVnd += taxVnd;
    lowerBound = upperBound;
  }
  return {
    ruleVersion: PERSONAL_INCOME_TAX_RULE_2026.version,
    taxableIncomeVnd,
    estimatedTaxVnd,
    netAfterTaxVnd: input.monthlyGrossVnd - input.insuranceVnd - estimatedTaxVnd,
    deductionsVnd,
    breakdown
  };
}

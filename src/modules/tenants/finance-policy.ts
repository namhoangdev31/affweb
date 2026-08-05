export type FundingCandidate = { id: string; amountVnd: bigint };

export function fifoFundingPlan(
  availableVnd: bigint,
  candidates: readonly FundingCandidate[]
): { fundedIds: string[]; fundedVnd: bigint; remainingVnd: bigint } {
  if (availableVnd < 0n) throw new Error("availableVnd cannot be negative");
  const fundedIds: string[] = [];
  let remainingVnd = availableVnd;
  let fundedVnd = 0n;
  for (const candidate of candidates) {
    if (candidate.amountVnd <= 0n) throw new Error("funding amount must be positive");
    if (remainingVnd < candidate.amountVnd) break;
    fundedIds.push(candidate.id);
    remainingVnd -= candidate.amountVnd;
    fundedVnd += candidate.amountVnd;
  }
  return { fundedIds, fundedVnd, remainingVnd };
}

export function tenantFinanceGateReady(input: {
  envFinance: boolean;
  envOperation: boolean;
  globalFinance: boolean;
  globalOperation: boolean;
  tenantFinance: boolean;
  tenantOperation: boolean;
}): boolean {
  return (
    input.envFinance &&
    input.envOperation &&
    input.globalFinance &&
    input.globalOperation &&
    input.tenantFinance &&
    input.tenantOperation
  );
}

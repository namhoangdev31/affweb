export type RateCandidate = {
  id: string;
  scope: "USER_CAMPAIGN" | "USER_MERCHANT" | "USER_GLOBAL" | "MERCHANT_DEFAULT" | "SYSTEM_DEFAULT";
  shareBps: number;
  validFrom: Date;
  validTo: Date | null;
};

const PRIORITY: Record<RateCandidate["scope"], number> = {
  USER_CAMPAIGN: 5,
  USER_MERCHANT: 4,
  USER_GLOBAL: 3,
  MERCHANT_DEFAULT: 2,
  SYSTEM_DEFAULT: 1
};

export function chooseRate(
  candidates: readonly RateCandidate[],
  at = new Date()
): RateCandidate | undefined {
  return candidates
    .filter(
      (candidate) => candidate.validFrom <= at && (!candidate.validTo || candidate.validTo > at)
    )
    .toSorted(
      (a, b) =>
        PRIORITY[b.scope] - PRIORITY[a.scope] || b.validFrom.getTime() - a.validFrom.getTime()
    )[0];
}

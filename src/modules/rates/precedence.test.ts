import { describe, expect, it } from "vitest";
import { chooseRate, type RateCandidate } from "@/modules/rates/precedence";

const now = new Date("2026-07-24T00:00:00.000Z");

function candidate(
  scope: RateCandidate["scope"],
  shareBps: number,
  validFrom = new Date("2026-01-01T00:00:00.000Z")
): RateCandidate {
  return { id: scope, scope, shareBps, validFrom, validTo: null };
}

describe("rate precedence", () => {
  it("uses user campaign before every lower scope", () => {
    const selected = chooseRate(
      [
        candidate("SYSTEM_DEFAULT", 1000),
        candidate("MERCHANT_DEFAULT", 2000),
        candidate("USER_GLOBAL", 3000),
        candidate("USER_MERCHANT", 4000),
        candidate("USER_CAMPAIGN", 5000)
      ],
      now
    );
    expect(selected?.scope).toBe("USER_CAMPAIGN");
    expect(selected?.shareBps).toBe(5000);
  });

  it("ignores future and expired versions", () => {
    const selected = chooseRate(
      [
        {
          ...candidate("USER_CAMPAIGN", 9000),
          validFrom: new Date("2027-01-01T00:00:00.000Z")
        },
        {
          ...candidate("USER_MERCHANT", 8000),
          validTo: new Date("2026-01-02T00:00:00.000Z")
        },
        candidate("SYSTEM_DEFAULT", 2500)
      ],
      now
    );
    expect(selected?.shareBps).toBe(2500);
  });
});

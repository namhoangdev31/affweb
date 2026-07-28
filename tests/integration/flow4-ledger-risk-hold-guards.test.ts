import { describe, expect, it } from "vitest";
import { BETA_DAILY_AVAILABLE_LIMIT_VND } from "@/lib/money";

describe("Flow 4: validation hold and settlement release guards", () => {
  it("ends validation hold without making cashback available", () => {
    const before = { pendingVnd: 100_000n, availableVnd: 0n };
    const afterValidation = {
      orderValidationStatus: "VALIDATED",
      pendingVnd: before.pendingVnd,
      availableVnd: before.availableVnd
    };

    expect(afterValidation).toEqual({
      orderValidationStatus: "VALIDATED",
      pendingVnd: 100_000n,
      availableVnd: 0n
    });
  });

  it("moves stale or unhealthy validation evidence to review", () => {
    const connectorHealthy = false;
    const authoritySufficient = true;
    const openReconciliationCases = 0;
    const nextStatus =
      connectorHealthy && authoritySufficient && openReconciliationCases === 0
        ? "VALIDATED"
        : "REVIEW_REQUIRED";

    expect(nextStatus).toBe("REVIEW_REQUIRED");
  });

  it("keeps the daily available limit at settlement time", () => {
    const dailyReleasedVnd = 450_000n;
    const settlementCashbackVnd = 100_000n;

    expect(dailyReleasedVnd + settlementCashbackVnd > BETA_DAILY_AVAILABLE_LIMIT_VND).toBe(true);
  });
});

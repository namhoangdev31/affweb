import { describe, expect, it } from "vitest";
import { canTransitionPayout, type PayoutState } from "@/modules/payout/state-machine";

describe("payout state machine", () => {
  it("supports the happy path", () => {
    const path: PayoutState[] = [
      "DRAFT",
      "RESERVED",
      "REVIEWED",
      "APPROVED",
      "SUBMITTED",
      "PROCESSING",
      "PAID"
    ];
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransitionPayout(path[index]!, path[index + 1]!)).toBe(true);
    }
  });

  it("does not allow paid, failed, or cancelled to move again", () => {
    for (const terminal of ["PAID", "FAILED", "CANCELLED"] as const) {
      expect(canTransitionPayout(terminal, "PROCESSING")).toBe(false);
    }
  });

  it("requires reconciliation from unknown before paid/failed", () => {
    expect(canTransitionPayout("UNKNOWN", "PAID")).toBe(true);
    expect(canTransitionPayout("UNKNOWN", "SUBMITTED")).toBe(false);
  });
});

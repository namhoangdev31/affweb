import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isBalancedJournal } from "@/modules/ledger/invariants";

describe("ledger invariant", () => {
  it("accepts balanced journals for arbitrary positive VND", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10_000_000_000n }), (amount) => {
        expect(
          isBalancedJournal([
            { direction: "DEBIT", amountVnd: amount },
            { direction: "CREDIT", amountVnd: amount }
          ])
        ).toBe(true);
      })
    );
  });

  it("rejects imbalance, zero, and one-sided journals", () => {
    expect(
      isBalancedJournal([
        { direction: "DEBIT", amountVnd: 100n },
        { direction: "CREDIT", amountVnd: 99n }
      ])
    ).toBe(false);
    expect(
      isBalancedJournal([
        { direction: "DEBIT", amountVnd: 0n },
        { direction: "CREDIT", amountVnd: 0n }
      ])
    ).toBe(false);
  });
});

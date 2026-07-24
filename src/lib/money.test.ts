import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { cashbackFromCommission, startOfVietnamDay } from "@/lib/money";

describe("cashbackFromCommission", () => {
  it("uses deterministic floor rounding and never exceeds commission", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 100_000_000_000n }),
        fc.integer({ min: 0, max: 10_000 }),
        (commission, shareBps) => {
          const cashback = cashbackFromCommission(commission, shareBps);
          expect(cashback).toBe((commission * BigInt(shareBps)) / 10_000n);
          expect(cashback).toBeGreaterThanOrEqual(0n);
          expect(cashback).toBeLessThanOrEqual(commission);
        }
      )
    );
  });

  it("rejects invalid rates", () => {
    expect(() => cashbackFromCommission(100n, -1)).toThrow();
    expect(() => cashbackFromCommission(100n, 10_001)).toThrow();
  });
});

describe("startOfVietnamDay", () => {
  it("uses UTC+7 boundaries independently of the server timezone", () => {
    expect(startOfVietnamDay(new Date("2026-07-24T16:30:00.000Z")).toISOString()).toBe(
      "2026-07-23T17:00:00.000Z"
    );
    expect(startOfVietnamDay(new Date("2026-07-24T18:30:00.000Z")).toISOString()).toBe(
      "2026-07-24T17:00:00.000Z"
    );
  });
});

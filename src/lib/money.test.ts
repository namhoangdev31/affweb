import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  cashbackFromCommission,
  startOfVietnamDay,
  TENANT_AFFILIATE_TAX_BPS,
  tenantCashbackFromCommission
} from "@/lib/money";

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

describe("tenantCashbackFromCommission", () => {
  it("trừ 10% thuế trước khi chia cashback cho member tenant", () => {
    expect(tenantCashbackFromCommission(100_000n, 7_000)).toEqual({
      withholdingTaxVnd: 10_000n,
      commissionAfterTaxVnd: 90_000n,
      cashbackVnd: 63_000n
    });
    expect(TENANT_AFFILIATE_TAX_BPS).toBe(1_000);
  });

  it("làm tròn xuống theo từng bước thuế rồi chia cashback", () => {
    expect(tenantCashbackFromCommission(101n, 5_000)).toEqual({
      withholdingTaxVnd: 10n,
      commissionAfterTaxVnd: 91n,
      cashbackVnd: 45n
    });
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

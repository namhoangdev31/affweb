import { describe, expect, it } from "vitest";
import { parseVndAmount, tenantCashbackFromCommission } from "@/lib/money";

describe("parseVndAmount", () => {
  it.each([
    ["0", 0n],
    ["120000", 120_000n],
    ["120000.00", 120_000n],
    ["120000.99", 120_000n],
    [120000, 120_000n],
    [120_000n, 120_000n]
  ])("parses exact VND amount %s", (input, expected) => {
    expect(parseVndAmount(input)).toBe(expected);
  });

  it.each(["-1", "1e6", "", "9,000", Number.MAX_SAFE_INTEGER + 1])(
    "rejects lossy or malformed amount %s",
    (input) => {
      expect(() => parseVndAmount(input)).toThrow();
    }
  );
});

describe("tenantCashbackFromCommission", () => {
  it("applies tax before member share and floors both bigint steps", () => {
    expect(tenantCashbackFromCommission(101n, 5_000, 1_000)).toEqual({
      withholdingTaxVnd: 10n,
      commissionAfterTaxVnd: 91n,
      cashbackVnd: 45n
    });
  });
});

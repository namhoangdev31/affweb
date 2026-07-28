import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHOPEE_RECONCILIATION_SCHEMA_VERSION,
  parseShopeeReconciliationCsv
} from "./shopee-reconciliation";

describe("Shopee Reconciliation 48-column CSV parser", () => {
  it("parses valid Shopee 48-column reconciliation CSV fixture correctly", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/shopee_reconciliation_invoice_sample.csv"
    );
    const content = fs.readFileSync(fixturePath, "utf-8");

    const result = parseShopeeReconciliationCsv(content);

    expect(result.quarantined).toHaveLength(0);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({
      rowNumber: 2,
      externalOrderId: "2512222B0X4JKR",
      externalItemKey: "54902801477:375270800575",
      netCommissionVnd: 3945n,
      rawOrderStatus: "Hoàn thành"
    });
    expect(result.lines[1]).toMatchObject({
      rowNumber: 3,
      externalOrderId: "2512222B0X4JKR",
      externalItemKey: "54902801477:375270800580",
      netCommissionVnd: 0n,
      rawOrderStatus: "Hoàn thành"
    });
    expect(result.totalNetCommissionVnd).toBe(3945n);
  });

  it("rejects CSV with missing headers or wrong schema", () => {
    const invalidContent = "Header1,Header2\nValue1,Value2";
    expect(() => parseShopeeReconciliationCsv(invalidContent)).toThrow(
      `CSV không khớp ${SHOPEE_RECONCILIATION_SCHEMA_VERSION}.`
    );
  });
});

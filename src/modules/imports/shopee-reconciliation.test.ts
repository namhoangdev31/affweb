import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHOPEE_RECONCILIATION_SCHEMA_VERSION,
  parseShopeeReconciliationCsv,
  processShopeeReconciliationInvoice
} from "./shopee-reconciliation";

describe("synthetic Shopee reconciliation parser", () => {
  it("parses the synthetic 48-column fixture without treating it as provider evidence", () => {
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

  it("hard-disables financial processing independently of route and feature flags", async () => {
    await expect(
      processShopeeReconciliationInvoice({
        actorUserId: "actor",
        affiliateAccountId: "account",
        filename: "synthetic.csv",
        content: "synthetic",
        externalReference: "synthetic",
        invoiceTotalVnd: "0",
        idempotencyKey: "synthetic",
        requestHash: "synthetic"
      })
    ).rejects.toThrow("chưa có provider contract đã xác minh");
  });
});

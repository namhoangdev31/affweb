import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseShopeeOrdersCsv,
  SHOPEE_ORDERS_SCHEMA_VERSION
} from "@/modules/imports/shopee-orders";

const fixtureUrl = new URL("./__fixtures__/shopee-orders-v1.csv", import.meta.url);

describe("Shopee Orders CSV contract", () => {
  it("parses the redacted 47-column contract and floors VND decimals", () => {
    const result = parseShopeeOrdersCsv(readFileSync(fixtureUrl, "utf8"));

    expect(SHOPEE_ORDERS_SCHEMA_VERSION).toBe("SHOPEE_CONVERSION_REPORT_V1_47");
    expect(result.quarantined).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      externalOrderId: "ORDER-FIXTURE-001",
      externalItemKey: "ITEM-FIXTURE-001:MODEL-FIXTURE-001",
      commissionVnd: 1500n,
      priceVnd: 100000n,
      quantity: 2,
      rawOrderStatus: "Hoàn thành"
    });
  });

  it("quarantines an empty SubID instead of guessing attribution", () => {
    const content = readFileSync(fixtureUrl, "utf8").replace("fixtureClickToken1234567890", "");
    const result = parseShopeeOrdersCsv(content);

    expect(result.rows).toEqual([]);
    expect(result.quarantined).toEqual([{ rowNumber: 2, code: "EMPTY_SUB_ID_1" }]);
  });

  it("quarantines unknown order status", () => {
    const content = readFileSync(fixtureUrl, "utf8").replace(
      "ORDER-FIXTURE-001,Hoàn thành",
      "ORDER-FIXTURE-001,Đang điều chỉnh"
    );
    const result = parseShopeeOrdersCsv(content);

    expect(result.rows).toEqual([]);
    expect(result.quarantined).toEqual([{ rowNumber: 2, code: "UNKNOWN_ORDER_STATUS" }]);
  });

  it("rejects schema drift", () => {
    const content = readFileSync(fixtureUrl, "utf8").replace("Checkout id", "Unknown Header");

    expect(() => parseShopeeOrdersCsv(content)).toThrow(
      "CSV không khớp SHOPEE_CONVERSION_REPORT_V1_47"
    );
  });

  it("quarantines duplicate natural keys in one file", () => {
    const content = readFileSync(fixtureUrl, "utf8").trimEnd();
    const [header, row] = content.split("\n");
    const result = parseShopeeOrdersCsv(`${header}\n${row}\n${row}\n`);

    expect(result.rows).toHaveLength(1);
    expect(result.quarantined).toEqual([{ rowNumber: 3, code: "DUPLICATE_NATURAL_KEY" }]);
  });
});

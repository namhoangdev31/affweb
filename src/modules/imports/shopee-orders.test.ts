import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseShopeeOrdersCsv,
  SHOPEE_CONVERSION_SCHEMA_EN,
  SHOPEE_CONVERSION_SCHEMA_VI,
  SHOPEE_ORDERS_SCHEMA_VERSION
} from "@/modules/imports/shopee-orders";

const fixtureUrl = new URL("./__fixtures__/shopee-orders-v1.csv", import.meta.url);
const realViFixtureUrl = new URL(
  "./__fixtures__/shopee-conversion-vi-47-real-redacted-v1.csv",
  import.meta.url
);
const realEnFixtureUrl = new URL(
  "./__fixtures__/shopee-conversion-en-47-real-redacted-v1.csv",
  import.meta.url
);

describe("Shopee Orders CSV contract", () => {
  it("parses the redacted 47-column contract and floors VND decimals", () => {
    const result = parseShopeeOrdersCsv(readFileSync(fixtureUrl, "utf8"));

    expect(SHOPEE_ORDERS_SCHEMA_VERSION).toBe(SHOPEE_CONVERSION_SCHEMA_VI);
    expect(result.schemaVersion).toBe(SHOPEE_CONVERSION_SCHEMA_VI);
    expect(result.quarantined).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      externalOrderId: "ORDER-FIXTURE-001",
      externalItemKey: "ITEM-FIXTURE-001:MODEL-FIXTURE-001",
      commissionVnd: 1500n,
      priceVnd: 100000n,
      quantity: 2,
      rawOrderStatus: "Hoàn thành",
      subIdVersion: "v2"
    });
  });

  it("rejects an invalid v2 SubID instead of guessing attribution", () => {
    const content = readFileSync(fixtureUrl, "utf8").replace("fixtureClickToken1234567890", "");
    expect(() => parseShopeeOrdersCsv(content)).toThrow("Shopee Sub ID v2 không hợp lệ");
  });

  it("quarantines unknown order status", () => {
    const content = readFileSync(fixtureUrl, "utf8").replace(
      "ORDER-FIXTURE-001,Hoàn thành",
      "ORDER-FIXTURE-001,Đang điều chỉnh"
    );
    const result = parseShopeeOrdersCsv(content);

    expect(result.rows).toEqual([]);
    expect(result.quarantined).toEqual([{ rowNumber: 2, code: "NON_PAYABLE_ORDER_STATUS" }]);
  });

  it("rejects schema drift", () => {
    const content = readFileSync(fixtureUrl, "utf8").replace("Checkout id", "Unknown Header");

    expect(() => parseShopeeOrdersCsv(content)).toThrow(
      "CSV không khớp shopee-conversion-vi-47-v1 hoặc shopee-conversion-en-47-v1"
    );
  });

  it("quarantines duplicate natural keys in one file", () => {
    const content = readFileSync(fixtureUrl, "utf8").trimEnd();
    const [header, row] = content.split("\n");
    expect(() => parseShopeeOrdersCsv(`${header}\n${row}\n${row}\n`)).toThrow("trùng natural key");
  });

  it("accepts both observed 47-column provider schemas and ignores cancelled rows", () => {
    const vi = parseShopeeOrdersCsv(readFileSync(realViFixtureUrl, "utf8"));
    const en = parseShopeeOrdersCsv(readFileSync(realEnFixtureUrl, "utf8"));

    expect(vi.schemaVersion).toBe(SHOPEE_CONVERSION_SCHEMA_VI);
    expect(en.schemaVersion).toBe(SHOPEE_CONVERSION_SCHEMA_EN);
    expect(vi.rows).toEqual([]);
    expect(en.rows).toEqual([]);
    expect(vi.quarantined).toEqual(en.quarantined);
    expect(vi.quarantined).toHaveLength(3);
  });

  it("rejects spreadsheet formulas before row processing", () => {
    const content = readFileSync(fixtureUrl, "utf8").replace("Fixture Item", "=HYPERLINK(A1)");
    expect(() => parseShopeeOrdersCsv(content)).toThrow("công thức không an toàn");
  });
});

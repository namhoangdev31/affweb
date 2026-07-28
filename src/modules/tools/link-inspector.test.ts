import { describe, expect, it } from "vitest";
import { cleanProviderUrl, detectAffiliateIdentifiers } from "@/modules/tools/link-inspector";

describe("internal link tools", () => {
  it("removes documented tracking parameters without changing product identity", () => {
    expect(
      cleanProviderUrl(
        "https://shopee.vn/product/123/456?utm_source=x&af_siteid=789&keep=1",
        "SHOPEE_MARKETPLACE"
      )
    ).toBe("https://shopee.vn/product/123/456");
  });

  it("labels detected identifiers as unverified", () => {
    expect(
      detectAffiliateIdentifiers(
        "https://www.lazada.vn/products/example.html?sub_aff_id=publisher-candidate"
      )
    ).toEqual([
      {
        provider: "LAZADA",
        field: "sub_aff_id",
        value: "publisher-candidate",
        verified: false
      }
    ]);
  });

  it("rejects unrelated hosts", () => {
    expect(() => detectAffiliateIdentifiers("https://example.com/?utm_source=123")).toThrow();
  });
});

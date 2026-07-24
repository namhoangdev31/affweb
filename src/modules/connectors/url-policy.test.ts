import { describe, expect, it } from "vitest";
import { inferPlatform, parseAllowedUrl } from "@/modules/connectors/url-policy";

describe("affiliate URL policy", () => {
  it("accepts supported partner hosts and subdomains", () => {
    expect(inferPlatform("https://shopee.vn/product/1/2")).toBe("SHOPEE_MARKETPLACE");
    expect(inferPlatform("https://vn.shp.ee/5vda57lx")).toBe("SHOPEE_MARKETPLACE");
    expect(inferPlatform("https://merchant.shopeefood.vn/restaurant/abc")).toBe("SHOPEE_FOOD");
    expect(inferPlatform("https://www.lazada.vn/products/foo-i1-s1.html")).toBe("LAZADA");
  });

  it("rejects open redirects, credentials, ports and lookalike domains", () => {
    expect(() => inferPlatform("https://shopee.vn.evil.example/product/1/2")).toThrow();
    expect(() =>
      parseAllowedUrl("https://user:pass@shopee.vn/product/1/2", "SHOPEE_MARKETPLACE")
    ).toThrow();
    expect(() => parseAllowedUrl("http://shopee.vn/product/1/2", "SHOPEE_MARKETPLACE")).toThrow();
  });

  it("canonicalizes Shopee product URLs cleanly", () => {
    const canonical = parseAllowedUrl(
      "https://shopee.vn/opaanlp/230419876/58055062502?__mobile__=1&credential_token=abc&exp_group=rollout",
      "SHOPEE_MARKETPLACE"
    );
    expect(canonical.toString()).toBe("https://shopee.vn/product/230419876/58055062502");
  });
});

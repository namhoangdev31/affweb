import { describe, expect, it } from "vitest";
import { canonicalLazadaSignature } from "@/modules/connectors/lazada";
import { shopeeSignature } from "@/modules/connectors/shopee-open-api";

describe("provider signatures", () => {
  it("matches the Shopee SHA256 fixture", () => {
    expect(shopeeSignature("app123", 1_700_000_000, '{"query":"{ ping }"}', "secret456")).toBe(
      "6b4741e3bc0b69389022fc7b2fe991b0057f37f76531b64ab607e1471adfd6cb"
    );
  });

  it("canonicalizes Lazada parameters lexicographically and uppercases HMAC", () => {
    expect(
      canonicalLazadaSignature(
        "/marketing/conversion/report",
        {
          timestamp: "1700000000000",
          app_key: "app123",
          sign_method: "sha256",
          userToken: "token789",
          dateStart: "2026-07-01",
          dateEnd: "2026-07-24"
        },
        "secret456"
      )
    ).toBe("62DF70D90D605A8D747DEC7295A3F2F62E49CC0EB4A50C39176DC6BFB28614A9");
  });
});

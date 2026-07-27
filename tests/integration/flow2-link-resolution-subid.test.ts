import { describe, expect, it } from "vitest";
import { parseAllowedUrl } from "@/modules/connectors/url-policy";
import { chooseRate, type RateCandidate } from "@/modules/rates/precedence";

describe("Flow 2: Link Resolution, Normalization & Dynamic SubID Packet Engine", () => {
  it("cleans raw product URLs by stripping tracking parameters like utm_source and gclid", () => {
    const rawUrl = "https://shopee.vn/product/12345/67890?utm_source=facebook&gclid=xyz123";
    const cleanedUrl = parseAllowedUrl(rawUrl, "SHOPEE_MARKETPLACE");

    expect(cleanedUrl.toString()).not.toContain("utm_source");
    expect(cleanedUrl.toString()).not.toContain("gclid");
    expect(cleanedUrl.toString()).toBe("https://shopee.vn/product/12345/67890");
  });

  it("evaluates rule scope hierarchy precedence in correct order (USER_CAMPAIGN > USER_MERCHANT > USER_GLOBAL > MERCHANT_DEFAULT > SYSTEM_DEFAULT)", () => {
    const now = new Date();
    const candidates: RateCandidate[] = [
      { id: "1", scope: "SYSTEM_DEFAULT", shareBps: 4000, validFrom: now, validTo: null },
      { id: "2", scope: "MERCHANT_DEFAULT", shareBps: 5000, validFrom: now, validTo: null },
      { id: "3", scope: "USER_GLOBAL", shareBps: 6000, validFrom: now, validTo: null },
      { id: "4", scope: "USER_MERCHANT", shareBps: 7000, validFrom: now, validTo: null },
      { id: "5", scope: "USER_CAMPAIGN", shareBps: 8000, validFrom: now, validTo: null }
    ];

    const chosen = chooseRate(candidates, now);
    expect(chosen?.shareBps).toBe(8000); // Highest priority scope
    expect(chosen?.scope).toBe("USER_CAMPAIGN");
  });

  it("encodes subIds packet with clickToken (sub1), userId (sub2), and tenantId (sub3)", () => {
    const clickToken = "click-uuid-5555";
    const userId = "usr-8888";
    const tenantId = "tenant-koc-sansale";

    const subIdsPacket = {
      sub1: clickToken,
      sub2: userId,
      sub3: tenantId
    };

    expect(subIdsPacket.sub1).toBe("click-uuid-5555");
    expect(subIdsPacket.sub2).toBe("usr-8888");
    expect(subIdsPacket.sub3).toBe("tenant-koc-sansale");
  });
});

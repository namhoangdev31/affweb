import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/webhooks/lazada/route";
import {
  AffiliateTargetType,
  ConnectorType,
  Platform,
  UserStatus
} from "@/generated/prisma/client";
import { db } from "@/lib/db";

describe("Lazada Postback Macros & Webhook Integration Test", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("handles Lazada Postback GET request with macros and ingests conversion", async () => {
    const targetEmail = `lazada-user-${randomUUID()}@example.com`;
    const user = await db.user.create({
      data: {
        email: targetEmail,
        name: "Lazada Test User",
        status: UserStatus.ACTIVE
      }
    });

    const merchant = await db.merchant.upsert({
      where: { slug: "lazada-vn" },
      update: {},
      create: {
        platform: Platform.LAZADA,
        code: "lazada_vn",
        slug: "lazada-vn",
        name: "Lazada Việt Nam",
        defaultShareBps: 5000
      }
    });

    const clickToken = `laz-click-${randomUUID()}`;
    const click = await db.affiliateClick.create({
      data: {
        clickToken,
        userId: user.id,
        merchantId: merchant.id,
        platform: Platform.LAZADA,
        targetType: AffiliateTargetType.PRODUCT,
        originUrl: "https://c.lazada.vn/t/c.defgHi",
        subIds: [clickToken, user.id],
        clickedAt: new Date()
      }
    });

    // Simulate Lazada S2S Postback GET query string with macros
    const orderId = `LAZ-ORDER-${Date.now()}`;
    const postbackUrl = `http://127.0.0.1:3000/api/webhooks/lazada?order_id=${orderId}&amount=500000&payout=50000&click_id=${clickToken}&sub_id1=${clickToken}&status=fulfilled`;

    const request = new Request(postbackUrl, { method: "GET" });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("success");
    expect(json.conversionId).toBeDefined();

    // Verify database record
    const conversion = await db.conversion.findUnique({
      where: { id: json.conversionId },
      include: { externalIdentities: true, items: true }
    });

    expect(conversion).toBeDefined();
    expect(conversion?.userId).toBe(user.id);
    expect(conversion?.grossCommissionVnd).toBe(50_000n);
    expect(conversion?.externalIdentities[0]?.externalOrderId).toBe(orderId);
  });

  it("handles Lazada Test Mode mock postback gracefully (Rule 5 Troubleshooting)", async () => {
    const postbackUrl = "http://127.0.0.1:3000/api/webhooks/lazada?order_id=test_order_123&payout=10000&click_id=testclickid&status=delivered";
    const request = new Request(postbackUrl, { method: "GET" });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("success");
    expect(json.test_mode).toBe(true);
  });
});

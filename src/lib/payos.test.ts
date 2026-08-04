import { afterEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { createPayOSPaymentLink } from "@/lib/payos";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  resetEnvCacheForTests();
});

describe("PayOS billing credential boundary", () => {
  it("does not fall back to payout credentials", async () => {
    process.env.SAAS_BILLING_ENABLED = "true";
    process.env.PAYOS_CLIENT_ID = "payout-client";
    process.env.PAYOS_API_KEY = "payout-api";
    process.env.PAYOS_CHECKSUM_KEY = "payout-checksum";
    delete process.env.PAYOS_BILLING_CLIENT_ID;
    delete process.env.PAYOS_BILLING_API_KEY;
    delete process.env.PAYOS_BILLING_CHECKSUM_KEY;
    resetEnvCacheForTests();

    await expect(
      createPayOSPaymentLink({
        orderCode: 1,
        amountVnd: 100_000n,
        description: "Invoice",
        returnUrl: "https://example.com/return",
        cancelUrl: "https://example.com/cancel",
        expiresAt: new Date(Date.now() + 60_000)
      })
    ).rejects.toThrow("Thanh toán SaaS chưa cấu hình PayOS Key");
  });
});

import { describe, expect, it } from "vitest";
import {
  billingWebhookMismatchReasons,
  nextSubscriptionExpiry,
  type BillingWebhookData,
  type PendingInvoiceSnapshot
} from "@/modules/tenants/billing-policy";

const now = new Date("2026-07-28T00:00:00.000Z");
const invoice: PendingInvoiceSnapshot = {
  orderCode: 123,
  status: "PENDING",
  amountVnd: 199_000n,
  durationDays: 30,
  currency: "VND",
  paymentLinkId: "payment-link-1",
  description: "Thanh toan PRO_199K",
  expiresAt: new Date("2026-07-29T00:00:00.000Z")
};
const webhook: BillingWebhookData = {
  orderCode: 123,
  amount: 199_000,
  currency: "VND",
  paymentLinkId: "payment-link-1",
  description: "Thanh toan PRO_199K"
};

describe("tenant billing policy", () => {
  it("requires an exact pending invoice snapshot match", () => {
    expect(billingWebhookMismatchReasons(invoice, webhook, now)).toEqual([]);
    expect(
      billingWebhookMismatchReasons(
        { ...invoice, status: "EXPIRED" },
        { ...webhook, amount: 199_001, paymentLinkId: "other" },
        now
      )
    ).toEqual(["status", "amount", "paymentLink"]);
  });

  it("rejects expired and malformed duration snapshots", () => {
    expect(
      billingWebhookMismatchReasons(
        { ...invoice, durationDays: null, expiresAt: now },
        webhook,
        now
      )
    ).toEqual(["duration", "expiry"]);
  });

  it("renews from the later of now and the current expiry", () => {
    expect(
      nextSubscriptionExpiry(new Date("2026-08-01T00:00:00.000Z"), 30, now).toISOString()
    ).toBe("2026-08-31T00:00:00.000Z");
    expect(
      nextSubscriptionExpiry(new Date("2026-07-01T00:00:00.000Z"), 30, now).toISOString()
    ).toBe("2026-08-27T00:00:00.000Z");
  });
});

export type BillingWebhookData = {
  orderCode: number;
  amount: number;
  currency: string;
  paymentLinkId: string;
  description: string;
};

export type PendingInvoiceSnapshot = {
  orderCode: number;
  status: string;
  amountVnd: bigint | null;
  durationDays: number | null;
  currency: string;
  paymentLinkId: string | null;
  description: string;
  expiresAt: Date | null;
};

export function billingWebhookMismatchReasons(
  invoice: PendingInvoiceSnapshot,
  webhook: BillingWebhookData,
  now: Date
): string[] {
  const reasons: string[] = [];
  if (invoice.status !== "PENDING") reasons.push("status");
  if (invoice.amountVnd === null || BigInt(webhook.amount) !== invoice.amountVnd) {
    reasons.push("amount");
  }
  if (invoice.durationDays === null || invoice.durationDays <= 0) reasons.push("duration");
  if (invoice.currency !== webhook.currency) reasons.push("currency");
  if (!invoice.paymentLinkId || invoice.paymentLinkId !== webhook.paymentLinkId) {
    reasons.push("paymentLink");
  }
  if (invoice.description !== webhook.description) reasons.push("description");
  if (invoice.orderCode !== webhook.orderCode) reasons.push("orderCode");
  if (!invoice.expiresAt || invoice.expiresAt.getTime() <= now.getTime()) reasons.push("expiry");
  return reasons;
}

export function nextSubscriptionExpiry(currentExpiry: Date, durationDays: number, now: Date): Date {
  const base = currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  return new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000);
}

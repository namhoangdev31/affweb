import "server-only";

import { PayOS } from "@payos/node";
import { z } from "zod";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

const webhookSchema = z
  .object({
    code: z.string(),
    desc: z.string(),
    success: z.boolean(),
    data: z
      .object({
        orderCode: z.number().int().safe().positive(),
        amount: z.number().int().safe().nonnegative(),
        description: z.string(),
        accountNumber: z.string(),
        reference: z.string(),
        transactionDateTime: z.string(),
        currency: z.string(),
        paymentLinkId: z.string(),
        code: z.string(),
        desc: z.string()
      })
      .passthrough(),
    signature: z.string().min(1)
  })
  .passthrough();

export type PayOSWebhookPayload = z.infer<typeof webhookSchema>;

function billingClient(): PayOS {
  const env = loadServerEnv();
  if (
    !env.SAAS_BILLING_ENABLED ||
    !env.PAYOS_BILLING_CLIENT_ID ||
    !env.PAYOS_BILLING_API_KEY ||
    !env.PAYOS_BILLING_CHECKSUM_KEY
  ) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Thanh toán SaaS đang tạm dừng.", 503);
  }
  return new PayOS({
    clientId: env.PAYOS_BILLING_CLIENT_ID,
    apiKey: env.PAYOS_BILLING_API_KEY,
    checksumKey: env.PAYOS_BILLING_CHECKSUM_KEY,
    timeout: 15_000,
    maxRetries: 0
  });
}

function providerAmount(amountVnd: bigint): number {
  if (amountVnd < 0n || amountVnd > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError("VALIDATION_ERROR", "Số tiền vượt giới hạn PayOS.", 400);
  }
  return Number(amountVnd);
}

export async function createPayOSPaymentLink(params: {
  orderCode: number;
  amountVnd: bigint;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}): Promise<{
  amountVnd: bigint;
  currency: string;
  paymentLinkId: string;
  checkoutUrl: string;
  qrCode: string;
}> {
  try {
    const result = await billingClient().paymentRequests.create({
      orderCode: params.orderCode,
      amount: providerAmount(params.amountVnd),
      description: params.description,
      returnUrl: params.returnUrl,
      cancelUrl: params.cancelUrl,
      expiredAt: Math.floor(params.expiresAt.getTime() / 1000)
    });
    if (
      result.orderCode !== params.orderCode ||
      result.amount !== providerAmount(params.amountVnd) ||
      result.currency !== "VND" ||
      !result.paymentLinkId ||
      !result.checkoutUrl ||
      !result.qrCode
    ) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "PayOS trả về payment link không hợp lệ.", 502);
    }
    return {
      amountVnd: BigInt(result.amount),
      currency: result.currency,
      paymentLinkId: result.paymentLinkId,
      checkoutUrl: result.checkoutUrl,
      qrCode: result.qrCode
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("CONNECTOR_UNAVAILABLE", "Không thể tạo payment link PayOS.", 503);
  }
}

export async function verifyPayOSWebhookSignature(
  input: unknown
): Promise<PayOSWebhookPayload["data"]> {
  const payload = webhookSchema.parse(input);
  try {
    return await billingClient().webhooks.verify(payload);
  } catch {
    throw new AppError("FORBIDDEN", "Chữ ký webhook PayOS không hợp lệ.", 400);
  }
}

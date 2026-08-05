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
  const clientId = env.PAYOS_CLIENT_ID;
  const apiKey = env.PAYOS_API_KEY;
  const checksumKey = env.PAYOS_CHECKSUM_KEY;

  if (env.SAAS_BILLING_ENABLED === false) {
    throw new AppError("CONNECTOR_DISABLED", "Thanh toán SaaS đang tạm dừng.", 503);
  }
  if (!clientId || !apiKey || !checksumKey) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Thanh toán SaaS chưa cấu hình PayOS Key.", 503);
  }
  return new PayOS({
    clientId,
    apiKey,
    checksumKey,
    timeout: 15_000,
    maxRetries: 0
  });
}

function tenantFundingClient(): PayOS {
  const env = loadServerEnv();
  if (!env.TENANT_FINANCE_ENABLED || !env.TENANT_TOPUP_ENABLED) {
    throw new AppError("CONNECTOR_DISABLED", "Nạp quỹ tenant đang tạm dừng.", 503);
  }
  if (!env.PAYOS_CLIENT_ID || !env.PAYOS_API_KEY || !env.PAYOS_CHECKSUM_KEY) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "PayOS funding tenant chưa được cấu hình.", 503);
  }
  return new PayOS({
    clientId: env.PAYOS_CLIENT_ID,
    apiKey: env.PAYOS_API_KEY,
    checksumKey: env.PAYOS_CHECKSUM_KEY,
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

export async function createTenantFundingPaymentLink(params: {
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
    const amount = providerAmount(params.amountVnd);
    const result = await tenantFundingClient().paymentRequests.create({
      orderCode: params.orderCode,
      amount,
      description: params.description,
      returnUrl: params.returnUrl,
      cancelUrl: params.cancelUrl,
      expiredAt: Math.floor(params.expiresAt.getTime() / 1000)
    });
    if (
      result.orderCode !== params.orderCode ||
      result.amount !== amount ||
      result.currency !== "VND" ||
      !result.paymentLinkId ||
      !result.checkoutUrl ||
      !result.qrCode
    ) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        "PayOS funding trả về dữ liệu không hợp lệ.",
        502
      );
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
    throw new AppError("CONNECTOR_UNAVAILABLE", "Không thể tạo payment link nạp quỹ tenant.", 503);
  }
}

export async function queryTenantFundingPaymentLink(orderCode: number): Promise<{
  paymentLinkId: string;
  orderCode: number;
  amountVnd: bigint;
  status: string;
} | null> {
  try {
    const result = await tenantFundingClient().paymentRequests.get(orderCode);
    if (result.orderCode !== orderCode || !result.id || !Number.isSafeInteger(result.amount)) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        "PayOS funding query trả dữ liệu không hợp lệ.",
        502
      );
    }
    return {
      paymentLinkId: result.id,
      orderCode: result.orderCode,
      amountVnd: BigInt(result.amount),
      status: result.status
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    return null;
  }
}

export async function verifyTenantFundingWebhookSignature(
  input: unknown
): Promise<PayOSWebhookPayload["data"]> {
  const payload = webhookSchema.parse(input);
  try {
    return await tenantFundingClient().webhooks.verify(payload);
  } catch {
    throw new AppError("FORBIDDEN", "Chữ ký webhook funding tenant không hợp lệ.", 400);
  }
}

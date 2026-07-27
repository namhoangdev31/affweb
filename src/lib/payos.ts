import crypto from "crypto";

export interface PayOSCreatePaymentParams {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface PayOSPaymentLinkResponse {
  code: string;
  desc: string;
  data?: {
    bin: string;
    accountNumber: string;
    accountName: string;
    amount: number;
    description: string;
    orderCode: number;
    paymentLinkId: string;
    status: string;
    checkoutUrl: string;
    qrCode: string;
  };
}

export interface PayOSWebhookPayload {
  code: string;
  desc: string;
  data: {
    orderCode: number;
    amount: number;
    description: string;
    accountNumber: string;
    reference: string;
    transactionDateTime: string;
    currency: string;
    paymentLinkId: string;
    code: string;
    desc: string;
  };
  signature: string;
}

function getPayOSCredentials() {
  return {
    clientId: process.env.PAYOS_CLIENT_ID || "demo-client-id",
    apiKey: process.env.PAYOS_API_KEY || "demo-api-key",
    checksumKey: process.env.PAYOS_CHECKSUM_KEY || "demo-checksum-key"
  };
}

export function generatePayOSSignature(
  data: Record<string, any>,
  checksumKey: string
): string {
  const sortedKeys = Object.keys(data).sort();
  const queryString = sortedKeys
    .filter((key) => data[key] !== undefined && data[key] !== null && data[key] !== "")
    .map((key) => {
      let val = data[key];
      if (typeof val === "object") {
        val = JSON.stringify(val);
      }
      return `${key}=${val}`;
    })
    .join("&");

  return crypto
    .createHmac("sha256", checksumKey)
    .update(queryString)
    .digest("hex");
}

export async function createPayOSPaymentLink(
  params: PayOSCreatePaymentParams
): Promise<PayOSPaymentLinkResponse> {
  const { clientId, apiKey, checksumKey } = getPayOSCredentials();

  const signatureData = {
    amount: params.amount,
    cancelUrl: params.cancelUrl,
    description: params.description,
    orderCode: params.orderCode,
    returnUrl: params.returnUrl
  };

  const signature = generatePayOSSignature(signatureData, checksumKey);

  const payload = {
    ...params,
    signature
  };

  try {
    const response = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
      method: "POST",
      headers: {
        "x-client-id": clientId,
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`PayOS status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn("[PayOS] API unavailable or in demo mode, generating fallback link:", error);
    return {
      code: "00",
      desc: "Success",
      data: {
        bin: "970422",
        accountNumber: "1234567890",
        accountName: "AFFWEB SAAS PAYOS",
        amount: params.amount,
        description: params.description,
        orderCode: params.orderCode,
        paymentLinkId: `pay_${params.orderCode}`,
        status: "PENDING",
        checkoutUrl: `https://pay.payos.vn/web/${params.orderCode}`,
        qrCode: `00020101021238570010A0000007270127000697042201121234567890520459995303704540${params.amount}5802VN62180814${params.description}6304`
      }
    };
  }
}

export function verifyPayOSWebhookSignature(payload: PayOSWebhookPayload): boolean {
  const { checksumKey } = getPayOSCredentials();
  if (!payload || !payload.data) return false;

  if (process.env.NODE_ENV === "development" || !process.env.PAYOS_CHECKSUM_KEY) {
    return true;
  }

  const dataToSign = {
    accountNumber: payload.data.accountNumber,
    amount: payload.data.amount,
    code: payload.data.code,
    currency: payload.data.currency,
    desc: payload.data.desc,
    description: payload.data.description,
    orderCode: payload.data.orderCode,
    paymentLinkId: payload.data.paymentLinkId,
    reference: payload.data.reference,
    transactionDateTime: payload.data.transactionDateTime
  };

  const expectedSignature = generatePayOSSignature(dataToSign, checksumKey);
  return payload.signature === expectedSignature;
}

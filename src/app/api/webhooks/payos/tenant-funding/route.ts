import { errorResponse } from "@/lib/errors";
import { verifyTenantFundingWebhookSignature } from "@/lib/payos";
import { readJson, requestId } from "@/lib/request";
import { creditTenantFundingOrder } from "@/modules/tenants/finance";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    const payload = await readJson<unknown>(request, 65_536);
    const verified = await verifyTenantFundingWebhookSignature(payload);
    if (verified.code !== "00") {
      return Response.json(
        { success: true, ignored: true },
        { headers: { "Cache-Control": "no-store", "X-Request-Id": id } }
      );
    }
    const result = await creditTenantFundingOrder({
      orderCode: verified.orderCode,
      paymentLinkId: verified.paymentLinkId,
      amountVnd: BigInt(verified.amount),
      currency: verified.currency
    });
    return Response.json(
      { success: true, duplicate: result.duplicate },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": id } }
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

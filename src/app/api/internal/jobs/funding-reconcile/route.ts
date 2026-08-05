import { z } from "zod";
import { db } from "@/lib/db";
import { financeReconciliationDelaysSeconds } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { queryTenantFundingPaymentLink } from "@/lib/payos";
import { requestId } from "@/lib/request";
import { verifyQStashRequest } from "@/modules/jobs/qstash";
import { scheduleFundingReconciliation } from "@/modules/tenants/recovery";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  fundingOrderId: z.string().cuid(),
  sequence: z.number().int().positive()
});

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    const rawBody = await request.text();
    await verifyQStashRequest(request, rawBody);
    const input = schema.parse(JSON.parse(rawBody));
    const order = await db.tenantFundingOrder.findUnique({ where: { id: input.fundingOrderId } });
    if (!order || order.status === "PAID" || order.status === "FAILED") {
      return Response.json({ ok: true, terminal: order?.status ?? "MISSING" });
    }
    const provider = await queryTenantFundingPaymentLink(order.orderCode);
    if (provider) {
      if (provider.amountVnd !== order.amountVnd || provider.orderCode !== order.orderCode) {
        await db.tenantFundingOrder.update({
          where: { id: order.id },
          data: { requiresManualReview: true, reviewReason: "PROVIDER_FUNDING_MISMATCH" }
        });
        return Response.json({ ok: false, manualReview: true }, { status: 409 });
      }
      await db.tenantFundingOrder.update({
        where: { id: order.id },
        data: {
          paymentLinkId: provider.paymentLinkId,
          reconciliationSequence: input.sequence,
          lastReconciledAt: new Date(),
          requiresManualReview: true,
          reviewReason: `PROVIDER_LINK_FOUND_${provider.status}_AWAITING_WEBHOOK`
        }
      });
      return Response.json({ ok: true, providerObserved: true, awaitingWebhook: true });
    }
    if (input.sequence < financeReconciliationDelaysSeconds().length) {
      await scheduleFundingReconciliation({
        fundingOrderId: order.id,
        sequence: input.sequence + 1
      });
    } else {
      await scheduleFundingReconciliation({
        fundingOrderId: order.id,
        sequence: input.sequence + 1
      });
    }
    return Response.json({ ok: true, providerObserved: false });
  } catch (error) {
    return errorResponse(error, id);
  }
}

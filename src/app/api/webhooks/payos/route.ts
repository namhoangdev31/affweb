import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { verifyPayOSWebhookSignature } from "@/lib/payos";
import { readJson, requestId, requestPayloadHash } from "@/lib/request";
import { featureEnabled } from "@/modules/flags/service";
import {
  billingWebhookMismatchReasons,
  nextSubscriptionExpiry
} from "@/modules/tenants/billing-policy";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    if (!(await featureEnabled("saas.billing.enabled", false))) {
      throw new AppError("CONNECTOR_DISABLED", "Thanh toán SaaS đang tạm dừng.", 503);
    }
    const payload = await readJson<unknown>(request, 65_536);
    const verified = await verifyPayOSWebhookSignature(payload);
    if (verified.code !== "00") {
      return Response.json(
        { success: true, ignored: true },
        { headers: { "Cache-Control": "no-store", "X-Request-Id": id } }
      );
    }
    const webhookFingerprint = requestPayloadHash({
      orderCode: verified.orderCode,
      paymentLinkId: verified.paymentLinkId,
      amount: verified.amount,
      currency: verified.currency
    });

    const result = await db.$transaction(
      async (tx) => {
        const found = await tx.saaSInvoice.findUnique({
          where: { orderCode: verified.orderCode },
          select: { id: true }
        });
        if (!found) {
          await tx.outboxEvent.upsert({
            where: {
              idempotencyKey: `saas:unknown-payment:${webhookFingerprint}:attention`
            },
            create: {
              aggregateType: "SaaSInvoice",
              aggregateId: "unknown",
              eventType: "saas.payment.attention_required",
              idempotencyKey: `saas:unknown-payment:${webhookFingerprint}:attention`,
              payload: { reason: "UNKNOWN_INVOICE" }
            },
            update: {}
          });
          return { duplicate: false, unknown: true };
        }
        await tx.$queryRaw`
          SELECT id FROM "SaaSInvoice" WHERE id = ${found.id} FOR UPDATE
        `;
        const invoice = await tx.saaSInvoice.findUnique({
          where: { id: found.id },
          include: { tenant: true }
        });
        if (!invoice) {
          throw new AppError("NOT_FOUND", "Invoice PayOS không tồn tại.", 404);
        }
        if (invoice.status === "PAID") {
          return { duplicate: true, invoiceId: invoice.id };
        }
        const now = new Date();
        const mismatchReasons = billingWebhookMismatchReasons(invoice, verified, now);
        if (mismatchReasons.length > 0) {
          await tx.auditLog.create({
            data: {
              action: "SAAS_PAYMENT_MISMATCH",
              entityType: "SaaSInvoice",
              entityId: invoice.id,
              metadata: {
                orderCode: verified.orderCode,
                paymentLinkMatches: verified.paymentLinkId === invoice.paymentLinkId,
                currencyMatches: verified.currency === invoice.currency,
                amountMatches: BigInt(verified.amount) === invoice.amountVnd,
                mismatchReasons
              }
            }
          });
          await tx.outboxEvent.upsert({
            where: {
              idempotencyKey: `saas:invoice:${invoice.id}:payment-mismatch:attention`
            },
            create: {
              aggregateType: "SaaSInvoice",
              aggregateId: invoice.id,
              eventType: "saas.payment.attention_required",
              idempotencyKey: `saas:invoice:${invoice.id}:payment-mismatch:attention`,
              payload: { reason: "INVOICE_MISMATCH" }
            },
            update: {}
          });
          return { duplicate: false, mismatch: true, invoiceId: invoice.id };
        }

        const newExpiry = nextSubscriptionExpiry(
          invoice.tenant.planExpiresAt,
          invoice.durationDays!,
          now
        );
        await tx.saaSInvoice.update({
          where: { id: invoice.id },
          data: { status: "PAID", paidAt: now }
        });
        await tx.tenant.update({
          where: { id: invoice.tenantId },
          data: {
            status: "ACTIVE",
            isTrial: false,
            planId: invoice.planCode,
            planCode: invoice.planCode,
            planExpiresAt: newExpiry
          }
        });
        await tx.auditLog.create({
          data: {
            action: "SAAS_SUBSCRIPTION_RENEWED",
            entityType: "Tenant",
            entityId: invoice.tenantId,
            metadata: {
              invoiceId: invoice.id,
              planCode: invoice.planCode,
              newExpiresAt: newExpiry.toISOString()
            }
          }
        });
        return { duplicate: false, mismatch: false, invoiceId: invoice.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    if ("mismatch" in result && result.mismatch) {
      throw new AppError("CONFLICT", "Webhook PayOS không khớp invoice.", 409);
    }
    if ("unknown" in result && result.unknown) {
      throw new AppError("NOT_FOUND", "Invoice PayOS không tồn tại.", 404);
    }

    return Response.json(
      { success: true, duplicate: result.duplicate },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": id } }
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPayOSWebhookSignature, PayOSWebhookPayload } from "@/lib/payos";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload: PayOSWebhookPayload = await request.json();

    if (!verifyPayOSWebhookSignature(payload)) {
      return NextResponse.json({ error: "Invalid PayOS Signature" }, { status: 400 });
    }

    const { orderCode, code } = payload.data;

    // Check if payment was successful (code "00")
    if (code !== "00") {
      return NextResponse.json({ success: true, message: "Non-successful payment code ignored" });
    }

    // Find SaaS invoice by orderCode
    const invoice = await db.saaSInvoice.findUnique({
      where: { orderCode },
      include: { tenant: true }
    });

    if (!invoice) {
      return NextResponse.json({ success: true, message: "Test webhook or unknown invoice acknowledged" }, { status: 200 });
    }

    if (invoice.status === "PAID") {
      return NextResponse.json({ success: true, message: "Invoice already paid" });
    }

    // Determine extension days (365 days for yearly, 30 days for monthly)
    const isYearly = invoice.planCode.endsWith("_YEARLY");
    const extensionDays = isYearly ? 365 : 30;

    const now = new Date();
    const currentExpiry = invoice.tenant.planExpiresAt > now ? invoice.tenant.planExpiresAt : now;
    const newExpiry = new Date(currentExpiry.getTime() + extensionDays * 24 * 60 * 60 * 1000);

    // Update invoice and tenant status atomically
    await db.$transaction([
      db.saaSInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "PAID",
          paidAt: now
        }
      }),
      db.tenant.update({
        where: { id: invoice.tenantId },
        data: {
          status: "ACTIVE",
          isTrial: false,
          planId: invoice.planCode,
          planExpiresAt: newExpiry
        }
      })
    ]);

    console.log(
      `[PayOS Webhook] Tenant ${invoice.tenant.slug} extended by ${extensionDays} days to ${newExpiry.toISOString()}`
    );

    return NextResponse.json({
      success: true,
      message: "Subscription renewed successfully",
      tenantSlug: invoice.tenant.slug,
      extensionDays,
      newExpiresAt: newExpiry
    });
  } catch (error: any) {
    console.error("[PayOS Webhook Error]", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

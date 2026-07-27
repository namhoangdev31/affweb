import { NextResponse } from "next/server";
import { ConnectorType, EvidenceAuthority, Platform } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ingestConversion } from "@/modules/conversions/service";

/**
 * Lazada S2S Postback Webhook Endpoint
 * 
 * Supports Lazada Adsense Postback Macros:
 * Pre-defined macros: {_p_offer}, {_p_pay_amount}, {_p_payout}
 * Custom macros: {sub_id1} ~ {sub_id6}, {sub_aff_id}
 * 
 * Example Postback URL configured in Lazada Adsense:
 * https://affweb.vn/api/webhooks/lazada?order_id={_p_offer}&amount={_p_pay_amount}&payout={_p_payout}&click_id={sub_id1}&sub_id2={sub_id2}&status={status}
 */
export async function GET(request: Request) {
  return handleLazadaPostback(request);
}

export async function POST(request: Request) {
  return handleLazadaPostback(request);
}

async function handleLazadaPostback(request: Request) {
  try {
    const url = new URL(request.url);
    const searchParams = Object.fromEntries(url.searchParams.entries());

    let bodyParams: Record<string, any> = {};
    if (request.method === "POST") {
      try {
        bodyParams = await request.json();
      } catch {
        const text = await request.text();
        const parsed = new URLSearchParams(text);
        bodyParams = Object.fromEntries(parsed.entries());
      }
    }

    const params = { ...searchParams, ...bodyParams };

    // Extract parameters according to Lazada macro spec
    const clickToken =
      params.click_id ||
      params.clickid ||
      params.transaction_id ||
      params.sub_id1 ||
      params.subId1 ||
      params.sub_aff_id;

    const externalOrderId =
      params.order_id ||
      params.orderId ||
      params.offer_id ||
      params.sub_order_id ||
      params._p_offer ||
      `LAZ-${Date.now()}`;

    const payoutStr = params.payout || params._p_payout || params.amount || params._p_pay_amount || "0";
    const statusStr = (params.status || params.order_status || "validated").toLowerCase();

    // Rule 5 Troubleshooting: Return success for Lazada 'Run Test' mock calls
    if (!clickToken || clickToken.startsWith("test") || clickToken.includes("testclickid")) {
      return NextResponse.json({
        status: "success",
        msg: "Lazada test postback received and validated successfully",
        test_mode: true
      });
    }

    // Convert payout to BigInt VND
    const payoutNum = parseFloat(payoutStr);
    const grossCommissionVnd = BigInt(Math.trunc(isNaN(payoutNum) ? 0 : payoutNum));

    // Map Lazada order status to system ConversionStatus
    let mappedStatus: "validated" | "pending" | "rejected" = "validated";
    if (statusStr.includes("return") || statusStr.includes("cancel") || statusStr.includes("reject")) {
      mappedStatus = "rejected";
    } else if (statusStr.includes("pending") || statusStr.includes("fulfilled")) {
      mappedStatus = "pending";
    }

    // Ensure AffiliateAccount exists for Lazada
    const affiliateAccount = await db.affiliateAccount.upsert({
      where: {
        connectorType_platform_externalAccountId: {
          connectorType: ConnectorType.LAZADA_OPEN_API,
          platform: Platform.LAZADA,
          externalAccountId: "lazada_official_postback"
        }
      },
      update: {},
      create: {
        connectorType: ConnectorType.LAZADA_OPEN_API,
        platform: Platform.LAZADA,
        externalAccountId: "lazada_official_postback",
        label: "Lazada Postback Account"
      }
    });

    // Ingest into core ledger & conversion system
    const result = await ingestConversion({
      source: ConnectorType.LAZADA_OPEN_API,
      authority: EvidenceAuthority.AUTHORITATIVE,
      platform: Platform.LAZADA,
      affiliateAccount,
      conversion: {
        externalOrderId,
        externalItemKey: params.sku || params.sub_order_id || "offer_item",
        clickToken,
        purchasedAt: new Date(),
        grossCommissionVnd,
        netCommissionVnd: grossCommissionVnd,
        status: mappedStatus,
        payload: params,
        items: [
          {
            externalItemId: params.sku || "item_1",
            name: params.offer_name || params.sku_name || "Lazada Product",
            quantity: 1,
            priceVnd: grossCommissionVnd * 10n,
            commissionVnd: grossCommissionVnd,
            cashbackVnd: (grossCommissionVnd * 5000n) / 10000n
          }
        ]
      }
    });

    return NextResponse.json({
      status: "success",
      msg: "Postback processed successfully",
      conversionId: result.conversionId
    });
  } catch (error: any) {
    console.error("[Lazada Postback Error]", error);
    return NextResponse.json(
      {
        status: "fail",
        msg: error?.message || "Internal postback error"
      },
      { status: 200 }
    );
  }
}

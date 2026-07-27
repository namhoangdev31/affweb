import { NextResponse } from "next/server";
import { createTenantCheckoutSession } from "@/lib/tenant";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tenantId, planCode } = body;

    if (!tenantId || !planCode) {
      return NextResponse.json(
        { error: "Thiếu thông tin tenantId hoặc planCode" },
        { status: 400 }
      );
    }

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    const session = await createTenantCheckoutSession({
      tenantId,
      planCode,
      baseUrl
    });

    return NextResponse.json({
      success: true,
      data: session
    });
  } catch (error: any) {
    console.error("[SaaS Checkout Error]", error);
    return NextResponse.json(
      { error: error?.message || "Lỗi tạo hóa đơn PayOS" },
      { status: 500 }
    );
  }
}

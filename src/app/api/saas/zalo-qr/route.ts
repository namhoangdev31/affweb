import { NextResponse } from "next/server";
import { generateZaloQRLoginSession } from "@/lib/zalo";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET: Generates QR Session for Tenant UI
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") || "demo-tenant-id";

  const qrSession = await generateZaloQRLoginSession(tenantId);
  return NextResponse.json(qrSession);
}

// POST: Handles QR scan authorization callback (Simulated or via Zalo App QR scan)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tenantId, sessionToken } = body;

    if (!tenantId || !sessionToken) {
      return NextResponse.json({ error: "Missing tenantId or sessionToken" }, { status: 400 });
    }

    const autoZaloToken = `zalo_session_${sessionToken}_${Date.now()}`;

    // Auto-update tenant Zalo Bot Token upon QR scan
    const updatedTenant = await db.tenant.update({
      where: { id: tenantId },
      data: {
        zaloBotToken: autoZaloToken,
        status: "ACTIVE"
      }
    });

    return NextResponse.json({
      success: true,
      message: "Quét mã QR Zalo thành công! Bot Zalo đã được tự động kích hoạt vào nhóm chat.",
      tenantSlug: updatedTenant.slug
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Lỗi xác thực QR Zalo" }, { status: 500 });
  }
}

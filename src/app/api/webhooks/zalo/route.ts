import { NextResponse } from "next/server";
import { handleZaloBotIncomingUpdate } from "@/lib/zalo";
import { loadServerEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Zalo Bot Master Webhook Endpoint is active"
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Standard Zalo Bot Platform update object structure
    const message = body?.message || body?.event;
    const chatId = message?.chat?.id || message?.from?.id || body?.chat_id || body?.recipient?.id;
    const senderName = message?.from?.name || body?.from?.name;
    const messageText = message?.text || body?.text || body?.message?.text;
    const tenantId = request.headers.get("x-tenant-id") || body?.tenantId;

    if (!chatId || !messageText) {
      return NextResponse.json({ ok: true, message: "No actionable text message" });
    }

    const envBaseUrl = loadServerEnv().APP_BASE_URL.replace(/\/$/, "");
    const host = request.headers.get("host");
    const protocol = host && !host.includes("localhost") ? "https" : "http";
    const baseUrl = host ? `${protocol}://${host}` : envBaseUrl;

    const result = await handleZaloBotIncomingUpdate({
      chatId: String(chatId),
      messageText: String(messageText),
      baseUrl,
      ...(tenantId ? { tenantId } : {}),
      ...(senderName ? { senderName: String(senderName) } : {})
    });

    return NextResponse.json({
      ok: true,
      data: result
    });
  } catch (error: any) {
    console.error("[Zalo Bot Platform Webhook Error]", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

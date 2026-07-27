import { NextResponse } from "next/server";
import { handleZaloBotIncomingUpdate } from "@/lib/zalo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Standard Zalo Bot Platform (bot.zapps.me) update object structure
    const message = body?.message;
    const chatId = message?.chat?.id || message?.from?.id || body?.chat_id;
    const senderName = message?.from?.name || body?.from?.name;
    const messageText = message?.text || body?.text;
    const tenantId = request.headers.get("x-tenant-id") || body?.tenantId || "demo-tenant-id";

    if (!chatId || !messageText) {
      return NextResponse.json({ success: true, message: "No actionable text message" });
    }

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    const result = await handleZaloBotIncomingUpdate({
      tenantId,
      chatId: String(chatId),
      messageText: String(messageText),
      baseUrl,
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

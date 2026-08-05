import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadServerEnv } from "@/lib/env";
import { AppError, errorResponse } from "@/lib/errors";
import { readJson, requestId } from "@/lib/request";
import { handleZaloBotIncomingUpdate } from "@/lib/zalo";

export const runtime = "nodejs";

const webhookSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    event_name: z.string(),
    message: z.unknown().optional()
  })
});

const textMessageSchema = z.object({
  from: z.object({ id: z.union([z.string(), z.number().int().safe()]) }),
  chat: z.object({
    id: z.union([z.string(), z.number().int().safe()]),
    chat_type: z.enum(["PRIVATE", "GROUP"]),
    name: z.string().optional(),
    display_name: z.string().optional()
  }),
  text: z.string().min(1).max(4_000),
  message_id: z.union([z.string(), z.number().int().safe()]),
  date: z.union([z.string(), z.number().int().safe()])
});

function verifyWebhookSecret(request: Request): void {
  const expected = loadServerEnv().ZALO_BOT_SECRET_TOKEN ?? process.env.ZALO_BOT_SECRET_TOKEN;
  const received = request.headers.get("x-bot-api-secret-token");
  if (!expected || !received) {
    throw new AppError("FORBIDDEN", "Zalo webhook secret bị thiếu.", 403);
  }
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  if (
    expectedBytes.length !== receivedBytes.length ||
    !timingSafeEqual(expectedBytes, receivedBytes)
  ) {
    throw new AppError("FORBIDDEN", "Zalo webhook secret không hợp lệ.", 403);
  }
}

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    verifyWebhookSecret(request);
    const body = webhookSchema.parse(await readJson(request, 65_536));
    if (body.result.event_name !== "message.text.received") {
      return Response.json(
        { ok: true, ignored: true },
        { headers: { "Cache-Control": "no-store", "X-Request-Id": id } }
      );
    }
    const message = textMessageSchema.parse(body.result.message);
    if (message.chat.chat_type !== "GROUP") {
      return Response.json(
        { ok: true, ignored: true },
        { headers: { "Cache-Control": "no-store", "X-Request-Id": id } }
      );
    }
    const groupName = message.chat.name ?? message.chat.display_name;
    const result = await handleZaloBotIncomingUpdate({
      chatId: String(message.chat.id),
      senderId: String(message.from.id),
      messageId: String(message.message_id),
      messageText: message.text,
      baseUrl: loadServerEnv().APP_BASE_URL,
      ...(groupName ? { groupName } : {})
    });
    return Response.json(
      { ok: true, result },
      {
        headers: { "Cache-Control": "no-store", "X-Request-Id": id }
      }
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

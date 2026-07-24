import { z } from "zod";
import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, readJson } from "@/lib/request";

export const runtime = "nodejs";

const subscriptionSchema = z.object({
  endpoint: z.url().refine((url) => url.startsWith("https://"), "Push endpoint must use HTTPS."),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256)
  })
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const input = subscriptionSchema.parse(await readJson(request, 16_384));
    await db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: request.headers.get("user-agent")
      },
      update: {
        userId: user.id,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: request.headers.get("user-agent")
      }
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const input = z.object({ endpoint: z.url() }).parse(await readJson(request));
    await db.pushSubscription.deleteMany({
      where: { endpoint: input.endpoint, userId: user.id }
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

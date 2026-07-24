import { stableHash } from "@/lib/crypto";
import { errorResponse } from "@/lib/errors";
import { resolveClickRedirect } from "@/modules/links/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ clickToken: string }> }
): Promise<Response> {
  try {
    const { clickToken } = await context.params;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent");
    const outbound = await resolveClickRedirect(clickToken, {
      ...(ip ? { ipHash: stableHash(ip) } : {}),
      ...(userAgent ? { userAgentHash: stableHash(userAgent) } : {})
    });
    return Response.redirect(outbound, 302);
  } catch (error) {
    return errorResponse(error);
  }
}

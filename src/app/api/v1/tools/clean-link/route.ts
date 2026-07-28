import { z } from "zod";
import { requireApiUser } from "@/lib/authz";
import { AppError, errorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, readJson, requestId } from "@/lib/request";
import { fetchAllowlistedPlatformUrl, inferPlatform } from "@/modules/connectors/url-policy";
import { cleanProviderUrl } from "@/modules/tools/link-inspector";

export const runtime = "nodejs";

const inputSchema = z.object({ url: z.url().max(4_096) });
const SHORT_HOSTS = new Set(["s.shopee.vn", "vn.shp.ee", "shp.ee", "s.lazada.vn", "c.lazada.vn"]);

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const limit = await rateLimit(`tool-clean-link:${user.id}`, 20, 60);
    if (!limit.allowed) {
      throw new AppError("RATE_LIMITED", "Bạn dùng Clean Link quá nhanh.", 429);
    }
    const input = inputSchema.parse(await readJson(request, 8_192));
    const platform = inferPlatform(input.url);
    const original = new URL(input.url);
    let resolvedUrl = input.url;
    if (SHORT_HOSTS.has(original.hostname.toLowerCase())) {
      const resolved = await fetchAllowlistedPlatformUrl(input.url, platform, {
        headers: { Accept: "text/html" }
      });
      await resolved.response.body?.cancel();
      resolvedUrl = resolved.finalUrl.toString();
    }
    return Response.json(
      {
        data: {
          platform,
          cleanUrl: cleanProviderUrl(resolvedUrl, platform)
        }
      },
      { headers: { "Cache-Control": "private, no-store", "X-Request-Id": id } }
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

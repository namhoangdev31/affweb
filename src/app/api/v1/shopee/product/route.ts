import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { requestId } from "@/lib/request";
import { fetchShopeeProductData, extractShopeeIds } from "@/lib/shopee-product";

export const runtime = "nodejs";

const inputSchema = z.object({
  url: z.string().min(1)
});

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    const body = (await request.json()) as { url?: string };
    const { url } = inputSchema.parse(body);

    const { itemId } = extractShopeeIds(url);
    if (!itemId) {
      return Response.json(
        { error: { code: "INVALID_URL", message: "Không tìm thấy Item ID trong liên kết Shopee.", requestId: id } },
        { status: 400 }
      );
    }

    const data = await fetchShopeeProductData(url);
    if (!data) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Không tìm thấy thông tin sản phẩm Shopee này.", requestId: id } },
        { status: 404 }
      );
    }

    return Response.json(jsonSafe({ ok: true, ...data }), {
      headers: { "Cache-Control": "no-store", "X-Request-Id": id }
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}

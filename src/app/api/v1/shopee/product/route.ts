import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { requestId } from "@/lib/request";
import { fetchShopeeProductData } from "@/lib/shopee-product";

export const runtime = "nodejs";

const inputSchema = z.object({
  url: z.string().min(1)
});

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    const body = (await request.json()) as { url?: string };
    const { url } = inputSchema.parse(body);

    const data = await fetchShopeeProductData(url);
    if (!data) {
      return Response.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Không bóc tách được thông tin sản phẩm Shopee từ liên kết này. Vui lòng thử dùng liên kết gốc hoặc liên kết sản phẩm đầy đủ.",
            requestId: id
          }
        },
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

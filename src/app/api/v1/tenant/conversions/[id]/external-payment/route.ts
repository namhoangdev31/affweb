import { requestId } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const reqId = await requestId();
  return Response.json(
    {
      error: {
        code: "GONE",
        message:
          "Endpoint external-payment đã bị ngưng hoạt động vĩnh viễn theo quy định tài chính mới."
      }
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": reqId
      }
    }
  );
}

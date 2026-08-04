import { AppError, errorResponse } from "@/lib/errors";
import { requestId } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const id = await requestId();
  try {
    throw new AppError(
      "CONNECTOR_DISABLED",
      "Shopee Hóa đơn đối soát chưa có provider contract đã xác minh.",
      503
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

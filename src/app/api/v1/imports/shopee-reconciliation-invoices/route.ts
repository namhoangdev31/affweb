import { requireApiRecentUser } from "@/lib/authz";
import { AppError, errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, requestId } from "@/lib/request";
import { featureEnabled } from "@/modules/flags/service";
import { processShopeeReconciliationInvoice } from "@/modules/imports/shopee-reconciliation";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const user = await requireApiRecentUser();
    const actorUserId = user.id;

    if (!(await featureEnabled("shopee.reconciliation_import.enabled", false))) {
      throw new AppError(
        "CONNECTOR_DISABLED",
        "Shopee Hóa đơn đối soát đang tạm khóa qua feature flag.",
        503
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const affiliateAccountId = formData.get("affiliateAccountId");
    const externalReference = formData.get("externalReference");
    const invoiceTotalVnd = formData.get("invoiceTotalVnd");
    const idempotencyKey = request.headers.get("idempotency-key");

    if (
      !(file instanceof File) ||
      typeof affiliateAccountId !== "string" ||
      typeof externalReference !== "string" ||
      typeof invoiceTotalVnd !== "string" ||
      !idempotencyKey
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Thiếu file CSV Hóa đơn đối soát, affiliateAccountId, externalReference, invoiceTotalVnd hoặc Idempotency-Key header.",
        400
      );
    }

    const content = await file.text();
    const result = await processShopeeReconciliationInvoice({
      actorUserId,
      affiliateAccountId,
      filename: file.name,
      content,
      externalReference,
      invoiceTotalVnd,
      idempotencyKey,
      requestHash: id
    });

    return Response.json({ ok: true, data: result }, { status: 200 });
  } catch (error) {
    return errorResponse(error, id);
  }
}

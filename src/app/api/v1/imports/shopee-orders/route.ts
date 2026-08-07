import { z } from "zod";
import { Role, ProviderAccountScope } from "@/generated/prisma/client";
import { requireApiRecentUser, requireApiRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestId } from "@/lib/request";
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";
import { importShopeeOrders } from "@/modules/imports/shopee-orders";
import { requireTenantPlan, tenantSubscriptionIsEffective } from "@/modules/tenants/plans";

export const runtime = "nodejs";

const affiliateAccountIdSchema = z.string().cuid();

export async function POST(request: Request): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(contentLength) || contentLength > 5 * 1024 * 1024) {
      throw new AppError("VALIDATION_ERROR", "Multipart body vượt giới hạn.", 413);
    }
    const actor = await requireApiRecentUser();
    const limit = await rateLimit(`shopee-orders-import:${actor.id}`, 5, 60);
    if (!limit.allowed) {
      throw new AppError("RATE_LIMITED", "Bạn import Shopee quá nhanh.", 429);
    }
    const formData = await request.formData();
    const affiliateAccountId = formData.get("affiliateAccountId");
    const file = formData.get("file");
    if (
      typeof affiliateAccountId !== "string" ||
      !affiliateAccountIdSchema.safeParse(affiliateAccountId).success
    ) {
      throw new AppError("VALIDATION_ERROR", "affiliateAccountId không hợp lệ.", 400);
    }
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 2 * 1024 * 1024 ||
      !file.name.toLowerCase().endsWith(".csv")
    ) {
      throw new AppError("VALIDATION_ERROR", "CSV phải có dung lượng 1 byte–2 MB.", 400);
    }
    const account = await db.affiliateAccount.findUnique({
      where: { id: affiliateAccountId },
      include: { tenant: true }
    });
    if (!account) {
      throw new AppError("NOT_FOUND", "Provider account không tồn tại.", 404);
    }
    if (account.scope === ProviderAccountScope.PLATFORM_MANAGED) {
      const finance = await requireApiRole([
        Role.FINANCE_REVIEWER,
        Role.FINANCE_APPROVER,
        Role.SUPER_ADMIN
      ]);
      if (finance.id !== actor.id) {
        throw new AppError("FORBIDDEN", "Phiên xác thực không khớp.", 403);
      }
      await requireRecentFinancePasskey(actor.id);
    } else {
      if (
        !account.tenant ||
        account.tenant.ownerUserId !== actor.id ||
        !tenantSubscriptionIsEffective(account.tenant)
      ) {
        throw new AppError("FORBIDDEN", "Bạn không quản lý provider account này.", 403);
      }
      const plan = await requireTenantPlan(account.tenant.planCode ?? account.tenant.planId);
      if (!plan.allowedConnectors.includes("SHOPEE_DIRECT")) {
        throw new AppError("CONNECTOR_DISABLED", "Tenant Shopee import đang được tắt.", 503);
      }
    }
    let content: string;
    const rawBytes = new Uint8Array(await file.arrayBuffer());
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
    } catch {
      throw new AppError("VALIDATION_ERROR", "CSV phải dùng UTF-8 hợp lệ.", 400);
    }
    const result = await importShopeeOrders({
      actorUserId: actor.id,
      affiliateAccountId,
      filename: file.name,
      content,
      rawBytes
    });
    return Response.json(jsonSafe({ data: result }), {
      status: 201,
      headers: { "Cache-Control": "no-store", "X-Request-Id": id }
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}

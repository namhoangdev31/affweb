"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { stableHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requestId } from "@/lib/request";
import { requireTenantUserContext } from "@/modules/tenants/persona";

export async function consumeZaloFinancialGrantAction(formData: FormData) {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const token = String(formData.get("grant") ?? "");
  const tenant = (await requireTenantUserContext(user.id, slug)).memberTenant!;
  const tokenHash = stableHash(token);
  const reqId = await requestId();
  const action = await db.$transaction(async (tx) => {
    const grant = await tx.zaloFinancialGrant.findUnique({ where: { tokenHash } });
    if (!grant) throw new AppError("VALIDATION_ERROR", "Link xác nhận không hợp lệ.", 400);
    await tx.$queryRaw`SELECT id FROM "ZaloFinancialGrant" WHERE id = ${grant.id} FOR UPDATE`;
    const current = await tx.zaloFinancialGrant.findUniqueOrThrow({ where: { id: grant.id } });
    if (
      current.consumedAt ||
      current.expiresAt <= new Date() ||
      current.tenantId !== tenant.id ||
      current.userId !== user.id
    ) {
      throw new AppError("CONFLICT", "Link xác nhận đã dùng, hết hạn hoặc sai tenant.", 409);
    }
    await tx.zaloFinancialGrant.update({
      where: { id: current.id },
      data: { consumedAt: new Date() }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        actorRole: "TENANT_USER",
        targetTenantId: tenant.id,
        targetUserId: user.id,
        source: "ZALO",
        requestId: reqId,
        action: "zalo.financial_grant.consumed",
        entityType: "ZaloFinancialGrant",
        entityId: current.id,
        after: { action: current.action }
      }
    });
    return current.action;
  });
  redirect(`/${tenant.slug}/app/wallet?zaloAction=${encodeURIComponent(action)}`);
}

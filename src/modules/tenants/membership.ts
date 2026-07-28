import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireTenantPlan, tenantSubscriptionIsEffective } from "@/modules/tenants/plans";

export async function resolveJoinableTenant(
  tx: Prisma.TransactionClient,
  input: { slug: string; currentTenantId?: string | null }
): Promise<string> {
  const found = await tx.tenant.findUnique({
    where: { slug: input.slug.toLowerCase().trim() },
    select: { id: true }
  });
  if (!found) throw new AppError("NOT_FOUND", "Nhóm không tồn tại.", 404);
  await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${found.id} FOR UPDATE`;
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: found.id } });
  if (input.currentTenantId && input.currentTenantId !== tenant.id) {
    throw new AppError("CONFLICT", "Tài khoản đã thuộc một nhóm khác.", 409);
  }
  if (!tenantSubscriptionIsEffective(tenant)) {
    throw new AppError("FORBIDDEN", "Gói dịch vụ của nhóm đã hết hiệu lực.", 403);
  }
  if (!tenant.shopeeAffiliateId || tenant.memberShareBps === null) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Nhóm chưa hoàn tất cấu hình Shopee.", 503);
  }
  const plan = await requireTenantPlan(tenant.planCode ?? tenant.planId, tx);
  const currentCount = await tx.user.count({ where: { tenantId: tenant.id } });
  if (!input.currentTenantId && currentCount >= plan.maxUsers) {
    throw new AppError("CONFLICT", "Nhóm đã đạt giới hạn thành viên.", 409);
  }
  return tenant.id;
}

export async function joinTenantBySlug(input: {
  userId: string;
  slug: string;
}): Promise<{ tenantId: string }> {
  return db.$transaction(
    async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { tenantId: true }
      });
      const tenantId = await resolveJoinableTenant(tx, {
        slug: input.slug,
        currentTenantId: user.tenantId
      });
      if (user.tenantId !== tenantId) {
        await tx.user.update({
          where: { id: input.userId },
          data: { tenantId }
        });
        await tx.auditLog.create({
          data: {
            actorUserId: input.userId,
            action: "tenant.member.joined",
            entityType: "Tenant",
            entityId: tenantId
          }
        });
      }
      return { tenantId };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

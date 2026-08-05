"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, Role, TenantStatus, UserStatus } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { registerTenantWithTrial } from "@/lib/tenant";
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";
import { requireTenantPlan } from "@/modules/tenants/plans";

const reasonSchema = z.string().trim().min(12).max(500);

async function adminWithPasskey() {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  await requireRecentFinancePasskey(actor.id);
  return actor;
}

export async function createTenantAdminAction(formData: FormData) {
  const actor = await adminWithPasskey();
  const input = z
    .object({
      ownerUserId: z.string().cuid(),
      name: z.string().trim().min(2).max(120),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(63)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      shopeeAffiliateId: z
        .string()
        .trim()
        .regex(/^\d{5,30}$/),
      memberShareBps: z.coerce.number().int().min(100).max(10_000),
      reason: reasonSchema
    })
    .parse(Object.fromEntries(formData));

  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.ownerUserId} FOR UPDATE`;
      const owner = await tx.user.findUniqueOrThrow({ where: { id: input.ownerUserId } });
      if (
        owner.status !== UserStatus.ACTIVE ||
        !owner.emailVerified ||
        owner.tenantId !== loadServerEnv().MASTER_TENANT_ID ||
        (await tx.tenant.count({ where: { ownerUserId: owner.id } })) > 0
      ) {
        throw new AppError(
          "CONFLICT",
          "Owner phải là master member active, có email verified và chưa sở hữu tenant.",
          409
        );
      }
      const tenant = await registerTenantWithTrial(
        {
          ownerUserId: owner.id,
          name: input.name,
          slug: input.slug,
          shopeeAffiliateId: input.shopeeAffiliateId,
          memberShareBps: input.memberShareBps
        },
        tx
      );
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: "tenant.admin.created",
          entityType: "Tenant",
          entityId: tenant.id,
          after: {
            ownerUserId: owner.id,
            planCode: "TRIAL_14D",
            reason: input.reason
          }
        }
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  revalidatePath("/admin/tenants");
}

export async function updateTenantFinanceFlagsAdminAction(formData: FormData) {
  const actor = await adminWithPasskey();
  const raw = Object.fromEntries(formData);
  const input = z
    .object({
      tenantId: z.string().cuid(),
      financeEnabled: z.boolean(),
      topupEnabled: z.boolean(),
      autoPayoutEnabled: z.boolean(),
      reason: reasonSchema
    })
    .parse({
      tenantId: raw.tenantId,
      financeEnabled: raw.financeEnabled === "on",
      topupEnabled: raw.topupEnabled === "on",
      autoPayoutEnabled: raw.autoPayoutEnabled === "on",
      reason: raw.reason
    });
  if (!input.financeEnabled && (input.topupEnabled || input.autoPayoutEnabled)) {
    throw new AppError("VALIDATION_ERROR", "Top-up/payout yêu cầu finance tenant được bật.", 400);
  }
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${input.tenantId} FOR UPDATE`;
    const current = await tx.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
    if (current.kind !== "STANDARD" || current.status === "CLOSED") {
      throw new AppError("CONFLICT", "Chỉ tenant thường đang tồn tại mới được bật tài chính.", 409);
    }
    const updated = await tx.tenant.update({
      where: { id: current.id },
      data: {
        financeEnabled: input.financeEnabled,
        topupEnabled: input.topupEnabled,
        autoPayoutEnabled: input.autoPayoutEnabled
      }
    });
    await tx.tenantTreasuryProjection.upsert({
      where: { tenantId: current.id },
      create: { tenantId: current.id },
      update: {}
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "tenant.finance.flags.updated",
        entityType: "Tenant",
        entityId: current.id,
        before: {
          financeEnabled: current.financeEnabled,
          topupEnabled: current.topupEnabled,
          autoPayoutEnabled: current.autoPayoutEnabled
        },
        after: {
          financeEnabled: updated.financeEnabled,
          topupEnabled: updated.topupEnabled,
          autoPayoutEnabled: updated.autoPayoutEnabled,
          reason: input.reason
        }
      }
    });
  });
  revalidatePath("/admin/tenants");
}

export async function updateTenantAdminAction(formData: FormData) {
  const actor = await adminWithPasskey();
  const input = z
    .object({
      tenantId: z.string().cuid(),
      name: z.string().trim().min(2).max(120),
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      shopeeAffiliateId: z
        .string()
        .trim()
        .regex(/^\d{5,30}$/),
      memberShareBps: z.coerce.number().int().min(100).max(10_000),
      reason: reasonSchema
    })
    .parse(Object.fromEntries(formData));
  await db.$transaction(async (tx) => {
    const current = await tx.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
    if (current.status === "CLOSED") {
      throw new AppError("CONFLICT", "Tenant đã đóng không thể chỉnh sửa.", 409);
    }
    const updated = await tx.tenant.update({
      where: { id: current.id },
      data: {
        name: input.name,
        brandColor: input.brandColor,
        shopeeAffiliateId: input.shopeeAffiliateId,
        memberShareBps: input.memberShareBps
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "tenant.admin.updated",
        entityType: "Tenant",
        entityId: current.id,
        before: {
          name: current.name,
          brandColor: current.brandColor,
          affiliateIdChanged: current.shopeeAffiliateId !== updated.shopeeAffiliateId,
          memberShareBps: current.memberShareBps
        },
        after: {
          name: updated.name,
          brandColor: updated.brandColor,
          affiliateIdChanged: current.shopeeAffiliateId !== updated.shopeeAffiliateId,
          memberShareBps: updated.memberShareBps,
          reason: input.reason
        }
      }
    });
  });
  revalidatePath("/admin/tenants");
}

export async function changeTenantStatusAdminAction(formData: FormData) {
  const actor = await adminWithPasskey();
  const input = z
    .object({
      tenantId: z.string().cuid(),
      action: z.enum(["SUSPEND", "RESTORE", "CLOSE"]),
      reason: reasonSchema
    })
    .parse(Object.fromEntries(formData));
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${input.tenantId} FOR UPDATE`;
      const current = await tx.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
      if (current.status === "CLOSED") {
        throw new AppError("CONFLICT", "Tenant đã đóng là trạng thái cuối.", 409);
      }
      let nextStatus: TenantStatus;
      if (input.action === "SUSPEND") {
        nextStatus = "SUSPENDED";
      } else if (input.action === "CLOSE") {
        nextStatus = "CLOSED";
      } else {
        if (current.status !== "SUSPENDED") {
          throw new AppError("CONFLICT", "Chỉ tenant bị đình chỉ mới được khôi phục.", 409);
        }
        const plan = await requireTenantPlan(current.planCode ?? current.planId, tx);
        nextStatus =
          current.planExpiresAt <= new Date()
            ? "PAST_DUE"
            : plan.billingCycle === "TRIAL"
              ? "TRIAL"
              : "ACTIVE";
      }
      await tx.tenant.update({ where: { id: current.id }, data: { status: nextStatus } });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: `tenant.admin.${input.action.toLowerCase()}`,
          entityType: "Tenant",
          entityId: current.id,
          before: { status: current.status },
          after: { status: nextStatus, reason: input.reason }
        }
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  revalidatePath("/admin/tenants");
}

export async function adjustTenantPlanAdminAction(formData: FormData) {
  const actor = await adminWithPasskey();
  const input = z
    .object({
      tenantId: z.string().cuid(),
      planCode: z.string().trim().min(3).max(64),
      extensionDays: z.coerce.number().int().min(1).max(3650),
      reason: reasonSchema
    })
    .parse(Object.fromEntries(formData));
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${input.tenantId} FOR UPDATE`;
      const current = await tx.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
      if (current.status === "CLOSED") {
        throw new AppError("CONFLICT", "Tenant đã đóng không thể gia hạn.", 409);
      }
      const plan = await requireTenantPlan(input.planCode, tx);
      if (plan.billingCycle === "TRIAL") {
        throw new AppError("VALIDATION_ERROR", "Admin không thể cấp lại trial.", 400);
      }
      const now = new Date();
      const base = current.planExpiresAt > now ? current.planExpiresAt : now;
      const newExpiresAt = new Date(base.getTime() + input.extensionDays * 24 * 60 * 60 * 1000);
      await tx.tenantSubscriptionAdjustment.create({
        data: {
          tenantId: current.id,
          actorUserId: actor.id,
          reason: input.reason,
          previousPlanCode: current.planCode ?? current.planId,
          newPlanCode: plan.code,
          previousExpiresAt: current.planExpiresAt,
          newExpiresAt,
          previousStatus: current.status,
          newStatus: "ACTIVE"
        }
      });
      await tx.tenant.update({
        where: { id: current.id },
        data: {
          planId: plan.code,
          planCode: plan.code,
          planExpiresAt: newExpiresAt,
          status: "ACTIVE",
          isTrial: false
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: "tenant.subscription.adjusted",
          entityType: "Tenant",
          entityId: current.id,
          before: {
            planCode: current.planCode ?? current.planId,
            expiresAt: current.planExpiresAt.toISOString()
          },
          after: {
            planCode: plan.code,
            expiresAt: newExpiresAt.toISOString(),
            reason: input.reason
          }
        }
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  revalidatePath("/admin/tenants");
}

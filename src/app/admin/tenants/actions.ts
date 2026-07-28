"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, Role, TenantStatus, UserStatus } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
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
        (await tx.tenant.count({ where: { ownerUserId: owner.id } })) > 0
      ) {
        throw new AppError(
          "CONFLICT",
          "Owner phải active, có email verified và chưa sở hữu tenant.",
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
      await tx.user.update({ where: { id: owner.id }, data: { tenantId: tenant.id } });
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

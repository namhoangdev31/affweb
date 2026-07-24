"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role, UserStatus } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { adminEmailAllowlist, loadServerEnv } from "@/lib/env";

export async function inviteUserAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const input = z
    .object({ email: z.string().trim().toLowerCase().email() })
    .parse(Object.fromEntries(formData));

  await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: input.email } });
    if (existing && existing.status !== UserStatus.INVITED) {
      throw new Error("Email này đã có tài khoản.");
    }
    const user = existing
      ? existing
      : await tx.user.create({
          data: {
            email: input.email,
            status: UserStatus.INVITED,
            inviteCode: randomBytes(24).toString("base64url"),
            roles: { create: { role: Role.USER, grantedByUserId: actor.id } },
            wallet: { create: {} }
          }
        });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "user.invited",
        entityType: "User",
        entityId: user.id,
        after: { email: input.email }
      }
    });
  });
  revalidatePath("/admin/users");
}

export async function updateUserStatusAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const input = z
    .object({
      userId: z.string().cuid(),
      status: z.enum(UserStatus)
    })
    .parse(Object.fromEntries(formData));
  if (actor.id === input.userId && input.status !== UserStatus.ACTIVE) {
    throw new Error("Không thể tự khóa tài khoản quản trị đang dùng.");
  }

  await db.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { status: true }
    });
    await tx.user.update({
      where: { id: input.userId },
      data: { status: input.status }
    });
    if (input.status === UserStatus.SUSPENDED || input.status === UserStatus.CLOSED) {
      await tx.session.deleteMany({ where: { userId: input.userId } });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "user.status_changed",
        entityType: "User",
        entityId: input.userId,
        before: { status: before.status },
        after: { status: input.status }
      }
    });
  });
  revalidatePath("/admin/users");
}

export async function setUserRoleAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const input = z
    .object({
      userId: z.string().cuid(),
      role: z.enum(Role),
      assigned: z.enum(["true", "false"]).transform((value) => value === "true")
    })
    .parse(Object.fromEntries(formData));

  const target = await db.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { email: true }
  });
  if (input.role !== Role.USER) {
    const allowlist = adminEmailAllowlist(loadServerEnv());
    if (!target.email || !allowlist.has(target.email.toLowerCase())) {
      throw new Error("Admin phải thuộc ADMIN_EMAIL_ALLOWLIST và đăng nhập bằng Google.");
    }
  }
  if (!input.assigned && input.role === Role.USER) {
    throw new Error("Role USER là role nền tảng và không thể gỡ.");
  }
  if (!input.assigned && input.role === Role.SUPER_ADMIN) {
    if (actor.id === input.userId) {
      throw new Error("Không thể tự gỡ quyền SUPER_ADMIN.");
    }
    const superAdminCount = await db.roleAssignment.count({ where: { role: Role.SUPER_ADMIN } });
    if (superAdminCount <= 1) throw new Error("Hệ thống phải còn ít nhất một SUPER_ADMIN.");
  }

  await db.$transaction(async (tx) => {
    if (input.assigned) {
      await tx.roleAssignment.upsert({
        where: { userId_role: { userId: input.userId, role: input.role } },
        create: { userId: input.userId, role: input.role, grantedByUserId: actor.id },
        update: { grantedByUserId: actor.id, grantedAt: new Date() }
      });
    } else {
      await tx.roleAssignment.delete({
        where: { userId_role: { userId: input.userId, role: input.role } }
      });
    }
    await tx.session.deleteMany({ where: { userId: input.userId } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: input.assigned ? "role.granted" : "role.revoked",
        entityType: "User",
        entityId: input.userId,
        after: { role: input.role, assigned: input.assigned }
      }
    });
  });
  revalidatePath("/admin/users");
}

"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  IdentityInvitationStatus,
  IdentityState,
  Role,
  UserStatus
} from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { adminEmailAllowlist, loadServerEnv } from "@/lib/env";
import { approveAccountDeletion } from "@/modules/identity/deletion";

async function revokeAllClerkSessions(clerkUserId: string): Promise<number> {
  const client = await clerkClient();
  const sessions = await client.sessions.getSessionList({ userId: clerkUserId, limit: 100 });
  await Promise.all(sessions.data.map((session) => client.sessions.revokeSession(session.id)));
  return sessions.data.length;
}

export async function inviteUserAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const input = z
    .object({ email: z.string().trim().toLowerCase().email() })
    .parse(Object.fromEntries(formData));

  const pending = await db.identityInvitation.findFirst({
    where: {
      email: input.email,
      status: { in: [IdentityInvitationStatus.PENDING, IdentityInvitationStatus.SENT] }
    }
  });
  if (pending) throw new Error("Email này đã có lời mời đang hoạt động.");

  const local = await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: input.email } });
    if (existing && existing.status !== UserStatus.INVITED) {
      throw new Error("Email này đã có tài khoản.");
    }
    const user =
      existing ??
      (await tx.user.create({
        data: {
          email: input.email,
          status: UserStatus.INVITED,
          identityState: IdentityState.UNLINKED,
          roles: { create: { role: Role.USER, grantedByUserId: actor.id } },
          wallet: { create: {} }
        }
      }));
    const invitation = await tx.identityInvitation.create({
      data: {
        email: input.email,
        userId: user.id,
        createdByUserId: actor.id,
        status: IdentityInvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    return { user, invitation };
  });

  try {
    const client = await clerkClient();
    const clerkInvitation = await client.invitations.createInvitation({
      emailAddress: input.email,
      expiresInDays: 30,
      redirectUrl: `${loadServerEnv().APP_BASE_URL}/sign-up`,
      notify: true,
      ignoreExisting: false
    });
    await db.$transaction([
      db.identityInvitation.update({
        where: { id: local.invitation.id },
        data: {
          clerkInvitationId: clerkInvitation.id,
          status: IdentityInvitationStatus.SENT,
          lastError: null
        }
      }),
      db.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: "user.invited",
          entityType: "User",
          entityId: local.user.id,
          after: { email: input.email, clerkInvitationId: clerkInvitation.id }
        }
      })
    ]);
  } catch (error) {
    await db.identityInvitation.update({
      where: { id: local.invitation.id },
      data: {
        status: IdentityInvitationStatus.FAILED,
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Clerk invitation failed",
        retryCount: { increment: 1 }
      }
    });
    throw error;
  }
  revalidatePath("/admin/users");
}

export async function revokeInvitationAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const { invitationId } = z
    .object({ invitationId: z.string().cuid() })
    .parse(Object.fromEntries(formData));
  const invitation = await db.identityInvitation.findUniqueOrThrow({
    where: { id: invitationId }
  });
  if (invitation.clerkInvitationId) {
    const client = await clerkClient();
    await client.invitations.revokeInvitation(invitation.clerkInvitationId);
  }
  await db.$transaction([
    db.identityInvitation.update({
      where: { id: invitationId },
      data: {
        status: IdentityInvitationStatus.REVOKED,
        revokedAt: new Date(),
        lastError: null
      }
    }),
    db.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "identity_invitation.revoked",
        entityType: "IdentityInvitation",
        entityId: invitationId
      }
    })
  ]);
  revalidatePath("/admin/users");
}

export async function resendInvitationAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const { invitationId } = z
    .object({ invitationId: z.string().cuid() })
    .parse(Object.fromEntries(formData));
  const invitation = await db.identityInvitation.findUniqueOrThrow({
    where: { id: invitationId }
  });
  const client = await clerkClient();
  if (invitation.clerkInvitationId && invitation.status === IdentityInvitationStatus.SENT) {
    await client.invitations.revokeInvitation(invitation.clerkInvitationId);
  }
  const clerkInvitation = await client.invitations.createInvitation({
    emailAddress: invitation.email,
    expiresInDays: 30,
    redirectUrl: `${loadServerEnv().APP_BASE_URL}/sign-up`,
    notify: true,
    ignoreExisting: true
  });
  await db.$transaction([
    db.identityInvitation.update({
      where: { id: invitationId },
      data: {
        clerkInvitationId: clerkInvitation.id,
        status: IdentityInvitationStatus.SENT,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        lastError: null,
        retryCount: { increment: 1 }
      }
    }),
    db.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "identity_invitation.resent",
        entityType: "IdentityInvitation",
        entityId: invitationId
      }
    })
  ]);
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

  const target = await db.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { clerkUserId: true, status: true }
  });
  const client = await clerkClient();

  if (input.status === UserStatus.ACTIVE && target.clerkUserId) {
    await client.users.unbanUser(target.clerkUserId);
  }

  await db.$transaction([
    db.user.update({
      where: { id: input.userId },
      data: {
        status: input.status,
        identityState:
          input.status === UserStatus.ACTIVE
            ? IdentityState.ACTIVE
            : input.status === UserStatus.INVITED
              ? IdentityState.UNLINKED
              : IdentityState.BANNED
      }
    }),
    db.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "user.status_changed",
        entityType: "User",
        entityId: input.userId,
        before: { status: target.status },
        after: { status: input.status }
      }
    })
  ]);

  if (
    target.clerkUserId &&
    (input.status === UserStatus.SUSPENDED || input.status === UserStatus.CLOSED)
  ) {
    try {
      await client.users.banUser(target.clerkUserId);
    } catch (error) {
      await db.user.update({
        where: { id: input.userId },
        data: { identityState: IdentityState.SYNC_ERROR }
      });
      throw error;
    }
  }
  revalidatePath("/admin/users");
}

export async function revokeUserSessionsAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const { userId } = z.object({ userId: z.string().cuid() }).parse(Object.fromEntries(formData));
  const target = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { clerkUserId: true }
  });
  if (!target.clerkUserId) throw new Error("Tài khoản chưa liên kết Clerk.");
  const revokedCount = await revokeAllClerkSessions(target.clerkUserId);
  await db.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: "session.revoked_all_by_admin",
      entityType: "User",
      entityId: userId,
      metadata: { revokedCount }
    }
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
    select: { email: true, clerkUserId: true }
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
    if (actor.id === input.userId) throw new Error("Không thể tự gỡ quyền SUPER_ADMIN.");
    const count = await db.roleAssignment.count({ where: { role: Role.SUPER_ADMIN } });
    if (count <= 1) throw new Error("Hệ thống phải còn ít nhất một SUPER_ADMIN.");
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
  if (target.clerkUserId) await revokeAllClerkSessions(target.clerkUserId);
  revalidatePath("/admin/users");
}

export async function approveDeletionRequestAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const { requestId } = z
    .object({ requestId: z.string().cuid() })
    .parse(Object.fromEntries(formData));
  await approveAccountDeletion(requestId, actor.id);
  revalidatePath("/admin/users");
}

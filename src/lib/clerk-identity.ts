import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import {
  IdentityInvitationStatus,
  IdentityState,
  Prisma,
  Role,
  UserStatus
} from "@/generated/prisma/client";
import { primaryVerifiedEmail, type ClerkUserLike } from "@/lib/clerk-identity-mapping";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { resolveJoinableTenant } from "@/modules/tenants/membership";

export type AppUser = {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  image: string | null;
  roles: Role[];
};

function displayName(user: ClerkUserLike): string | null {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

function asAppUser(user: {
  id: string;
  clerkUserId: string | null;
  email: string | null;
  name: string | null;
  image: string | null;
  roles: Array<{ role: Role }>;
}): AppUser {
  if (!user.clerkUserId) {
    throw new AppError("AUTH_REQUIRED", "Tài khoản chưa được liên kết với Clerk.", 401);
  }
  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    name: user.name,
    image: user.image,
    roles: user.roles.map(({ role }) => role)
  };
}

export async function findActiveAppUser(clerkUserId: string): Promise<AppUser | null> {
  const user = await db.user.findUnique({
    where: { clerkUserId },
    select: {
      id: true,
      clerkUserId: true,
      email: true,
      name: true,
      image: true,
      status: true,
      identityState: true,
      roles: { select: { role: true } }
    }
  });
  if (!user || user.status !== UserStatus.ACTIVE || user.identityState !== IdentityState.ACTIVE) {
    return null;
  }
  return asAppUser(user);
}

export async function reconcileClerkUser(user: ClerkUserLike): Promise<AppUser> {
  const email = primaryVerifiedEmail(user);
  if (!email) {
    throw new AppError(
      "FORBIDDEN",
      "Clerk phải có email chính đã xác minh trước khi truy cập.",
      403
    );
  }
  if (user.banned || user.locked) {
    throw new AppError("ACCOUNT_INACTIVE", "Tài khoản Clerk đang bị khóa.", 403);
  }

  return db.$transaction(
    async (tx) => {
      const [byClerkId, byEmail] = await Promise.all([
        tx.user.findUnique({
          where: { clerkUserId: user.id },
          include: { roles: { select: { role: true } } }
        }),
        tx.user.findUnique({
          where: { email },
          include: { roles: { select: { role: true } } }
        })
      ]);

      if (byClerkId && byEmail && byClerkId.id !== byEmail.id) {
        await tx.user.update({
          where: { id: byEmail.id },
          data: { identityState: IdentityState.SYNC_ERROR }
        });
        throw new AppError("CONFLICT", "Email đã liên kết với một danh tính khác.", 409);
      }

      const existing = byClerkId ?? byEmail;
      const updatedAt = new Date(user.updatedAt);
      if (
        existing?.identityUpdatedAt &&
        existing.identityUpdatedAt.getTime() > updatedAt.getTime() &&
        existing.status === UserStatus.ACTIVE &&
        existing.identityState === IdentityState.ACTIVE
      ) {
        return asAppUser(existing);
      }
      if (
        existing &&
        (existing.status === UserStatus.SUSPENDED || existing.status === UserStatus.CLOSED)
      ) {
        throw new AppError("ACCOUNT_INACTIVE", "Tài khoản nội bộ đang bị khóa.", 403);
      }
      if (!byClerkId && loadServerEnv().REGISTRATION_MODE !== "public") {
        const invitation = existing
          ? await tx.identityInvitation.findFirst({
              where: {
                userId: existing.id,
                email,
                status: {
                  in: [IdentityInvitationStatus.PENDING, IdentityInvitationStatus.SENT]
                }
              },
              select: { id: true }
            })
          : null;
        if (!existing || existing.status !== UserStatus.INVITED || !invitation) {
          throw new AppError("FORBIDDEN", "Beta chỉ dành cho email đã được mời.", 403);
        }
      }

      let initialTenantId: string | undefined = undefined;
      if (!existing?.tenantId) {
        try {
          const { cookies } = await import("next/headers");
          const cookieStore = await cookies();
          const tenantSlug = cookieStore.get("aff_tenant_slug")?.value;
          if (tenantSlug) {
            initialTenantId = await resolveJoinableTenant(tx, {
              slug: tenantSlug,
              ...(existing?.tenantId ? { currentTenantId: existing.tenantId } : {})
            });
          }
        } catch {
          // Non-request context fallback
        }
      }

      const data = {
        clerkUserId: user.id,
        email,
        emailVerified: new Date(),
        name: displayName(user),
        image: user.imageUrl || null,
        status: UserStatus.ACTIVE,
        identityState: IdentityState.ACTIVE,
        identityUpdatedAt: updatedAt,
        ...(initialTenantId ? { tenantId: initialTenantId } : {})
      };

      const local = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              ...data,
              roles: {
                upsert: {
                  where: { userId_role: { userId: existing.id, role: Role.USER } },
                  create: { role: Role.USER },
                  update: {}
                }
              },
              wallet: { upsert: { create: {}, update: {} } }
            },
            include: { roles: { select: { role: true } } }
          })
        : await tx.user.create({
            data: {
              ...data,
              roles: { create: { role: Role.USER } },
              wallet: { create: {} }
            },
            include: { roles: { select: { role: true } } }
          });

      await tx.identityInvitation.updateMany({
        where: {
          email,
          status: {
            in: [IdentityInvitationStatus.PENDING, IdentityInvitationStatus.SENT]
          }
        },
        data: {
          userId: local.id,
          status: IdentityInvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
          lastError: null
        }
      });

      return asAppUser(local);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function resolveAppUser(clerkUserId: string): Promise<AppUser> {
  const active = await findActiveAppUser(clerkUserId);
  if (active) return active;

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);
  return reconcileClerkUser(clerkUser);
}

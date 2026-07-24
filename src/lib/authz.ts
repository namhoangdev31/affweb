import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role, UserStatus } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { adminEmailAllowlist, hasDatabase, loadServerEnv } from "@/lib/env";

const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

async function activeUser(userId: string) {
  if (!hasDatabase(loadServerEnv())) return true;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { status: true }
  });
  return user?.status === UserStatus.ACTIVE;
}

async function hasFreshAdminSession(userId: string) {
  const cookieStore = await cookies();
  const sessionToken =
    cookieStore.get("__Secure-authjs.session-token")?.value ??
    cookieStore.get("authjs.session-token")?.value;
  if (!sessionToken) return false;
  const cutoff = new Date(Date.now() - ADMIN_SESSION_MAX_AGE_MS);
  return Boolean(
    await db.session.findFirst({
      where: {
        sessionToken,
        userId,
        createdAt: { gte: cutoff },
        expires: { gt: new Date() }
      },
      select: { sessionToken: true }
    })
  );
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!(await activeUser(session.user.id))) {
    redirect("/login?error=AccountInactive");
  }
  return session.user;
}

export async function requireApiUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AppError("AUTH_REQUIRED", "Authentication is required.", 401);
  }
  if (!(await activeUser(session.user.id))) {
    throw new AppError("ACCOUNT_INACTIVE", "This account is inactive.", 403);
  }
  return session.user;
}

export async function requireRole(allowed: readonly Role[]) {
  const user = await requireUser();
  if (!user.roles.some((role) => allowed.includes(role))) {
    redirect("/unauthorized");
  }
  const env = loadServerEnv();
  if (
    hasDatabase(env) &&
    (!user.email ||
      !adminEmailAllowlist(env).has(user.email.toLowerCase()) ||
      !(await hasFreshAdminSession(user.id)))
  ) {
    redirect("/login?error=AdminSessionExpired");
  }
  return user;
}

export async function requireApiRole(allowed: readonly Role[]) {
  const user = await requireApiUser();
  if (!user.roles.some((role) => allowed.includes(role))) {
    throw new AppError("FORBIDDEN", "You do not have permission for this action.", 403);
  }
  const env = loadServerEnv();
  if (
    hasDatabase(env) &&
    (!user.email ||
      !adminEmailAllowlist(env).has(user.email.toLowerCase()) ||
      !(await hasFreshAdminSession(user.id)))
  ) {
    throw new AppError("ADMIN_SESSION_EXPIRED", "Admin re-authentication is required.", 401);
  }
  return user;
}

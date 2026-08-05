import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/client";
import { resolveAppUser, type AppUser } from "@/lib/clerk-identity";
import { hasVerifiedGoogleConnection } from "@/lib/clerk-identity-mapping";
import { AppError } from "@/lib/errors";
import { adminEmailAllowlist, loadServerEnv } from "@/lib/env";
import { getRedis } from "@/lib/redis";

const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const SENSITIVE_SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const ADMIN_CHECK_CACHE_SECONDS = 5 * 60;

async function currentClerkIdentity(): Promise<{ userId: string; sessionId: string | null }> {
  const identity = await auth();
  if (!identity.userId) {
    throw new AppError("AUTH_REQUIRED", "Authentication is required.", 401);
  }
  return { userId: identity.userId, sessionId: identity.sessionId };
}

async function hasFreshAdminIdentity(user: AppUser, sessionId: string | null): Promise<boolean> {
  if (
    !sessionId ||
    !user.email ||
    !adminEmailAllowlist(loadServerEnv()).has(user.email.toLowerCase())
  ) {
    return false;
  }

  const redis = getRedis();
  if (!redis) return false;
  const cacheKey = `clerk:admin-session:${sessionId}`;

  try {
    const cached = await redis.get<"valid" | "invalid">(cacheKey);
    if (cached) return cached === "valid";

    const client = await clerkClient();
    const [session, clerkUser] = await Promise.all([
      client.sessions.getSession(sessionId),
      client.users.getUser(user.clerkUserId)
    ]);
    const valid =
      session.userId === user.clerkUserId &&
      session.status === "active" &&
      Date.now() - session.createdAt <= ADMIN_SESSION_MAX_AGE_MS &&
      !clerkUser.banned &&
      !clerkUser.locked &&
      hasVerifiedGoogleConnection(clerkUser);
    await redis.set(cacheKey, valid ? "valid" : "invalid", {
      ex: ADMIN_CHECK_CACHE_SECONDS
    });
    return valid;
  } catch {
    return false;
  }
}

async function apiUserWithIdentity(): Promise<{
  user: AppUser;
  sessionId: string | null;
}> {
  const identity = await currentClerkIdentity();
  const user = await resolveAppUser(identity.userId);
  return { user, sessionId: identity.sessionId };
}

export async function requireUser(): Promise<AppUser> {
  try {
    return (await apiUserWithIdentity()).user;
  } catch (error) {
    if (error instanceof AppError && error.code === "ACCOUNT_INACTIVE") {
      redirect("/sign-in?error=AccountInactive" as Route);
    }
    if (error instanceof AppError && error.code === "FORBIDDEN") {
      redirect("/unauthorized" as Route);
    }
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.delete("__session");
      cookieStore.delete("__clerk_db_jwt");
    } catch {
      // Non-request context
    }
    redirect("/sign-in" as Route);
  }
}

export async function requireApiUser(): Promise<AppUser> {
  return (await apiUserWithIdentity()).user;
}

export async function requireApiRecentUser(): Promise<AppUser> {
  const { user, sessionId } = await apiUserWithIdentity();
  if (!sessionId) {
    throw new AppError("ADMIN_SESSION_EXPIRED", "Recent authentication is required.", 401);
  }
  try {
    const client = await clerkClient();
    const session = await client.sessions.getSession(sessionId);
    if (
      session.userId !== user.clerkUserId ||
      session.status !== "active" ||
      Date.now() - session.createdAt > SENSITIVE_SESSION_MAX_AGE_MS
    ) {
      throw new AppError("ADMIN_SESSION_EXPIRED", "Recent authentication is required.", 401);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("ADMIN_SESSION_EXPIRED", "Recent authentication is required.", 401);
  }
  return user;
}

export async function requireRole(allowed: readonly Role[]): Promise<AppUser> {
  const { user, sessionId } = await apiUserWithIdentity().catch(() =>
    redirect("/sign-in" as Route)
  );
  if (!user.roles.some((role) => allowed.includes(role))) {
    redirect("/unauthorized");
  }
  if (!(await hasFreshAdminIdentity(user, sessionId))) {
    redirect("/sign-in?error=AdminSessionExpired" as Route);
  }
  return user;
}

export async function requireApiRole(allowed: readonly Role[]): Promise<AppUser> {
  const { user, sessionId } = await apiUserWithIdentity();
  if (!user.roles.some((role) => allowed.includes(role))) {
    throw new AppError("FORBIDDEN", "You do not have permission for this action.", 403);
  }
  if (!(await hasFreshAdminIdentity(user, sessionId))) {
    throw new AppError("ADMIN_SESSION_EXPIRED", "Admin re-authentication is required.", 401);
  }
  return user;
}

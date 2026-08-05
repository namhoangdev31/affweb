import "server-only";

import type { Tenant } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { deriveTenantPersona } from "@/modules/tenants/persona-policy";

export type TenantPersona = "OWNER" | "MASTER_MEMBER" | "TENANT_MASTER" | "TENANT_USER";

export type TenantContext = {
  persona: TenantPersona;
  masterTenant: Tenant;
  memberTenant: Tenant | null;
  ownedTenant: Tenant | null;
};

async function masterTenant(): Promise<Tenant> {
  const masterTenantId = loadServerEnv().MASTER_TENANT_ID;
  let master: Tenant | null = null;
  if (masterTenantId) {
    master = await db.tenant.findUnique({ where: { id: masterTenantId } });
  }
  if (!master || master.kind !== "MASTER" || !["TRIAL", "ACTIVE"].includes(master.status)) {
    master = await db.tenant.findFirst({
      where: { kind: "MASTER", status: { in: ["TRIAL", "ACTIVE"] } }
    });
  }
  if (!master) {
    throw new AppError(
      "CONNECTOR_UNAVAILABLE",
      "Master tenant không hợp lệ hoặc chưa hoạt động.",
      503
    );
  }
  return master;
}

export async function resolveTenantContext(userId: string): Promise<TenantContext> {
  const master = await masterTenant();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      tenant: true,
      ownedTenant: true,
      roles: { select: { role: true } }
    }
  });
  if (!user) throw new AppError("AUTH_REQUIRED", "Tài khoản không tồn tại.", 401);

  const ownedTenant = user.ownedTenant?.kind === "STANDARD" ? user.ownedTenant : null;
  const isPlatformOwner =
    userId === master.ownerUserId || user.roles.some(({ role }) => role === "SUPER_ADMIN");
  const persona = isPlatformOwner
    ? "OWNER"
    : deriveTenantPersona({
        userId,
        masterOwnerUserId: master.ownerUserId!,
        masterTenantId: master.id,
        membershipTenantId: user.tenant?.id ?? null,
        membershipKind: user.tenant?.kind ?? null,
        ownsStandardTenant: Boolean(ownedTenant)
      });

  if (persona === "OWNER") {
    return { persona: "OWNER", masterTenant: master, memberTenant: null, ownedTenant: master };
  }

  if (persona === "MASTER_MEMBER" || persona === "TENANT_MASTER") {
    return {
      persona,
      masterTenant: master,
      memberTenant: master,
      ownedTenant
    };
  }

  return {
    persona: "TENANT_USER",
    masterTenant: master,
    memberTenant: user.tenant,
    ownedTenant: null
  };
}

export type FinancialActorRole = "OWNER" | "TENANT_MASTER" | "TENANT_USER" | "SYSTEM_WORKER";

export type FinancialActorContext = {
  actorUserId: string | null;
  actorRole: FinancialActorRole;
  workerIdentity?: string | undefined;
  targetTenantId: string;
  targetUserId?: string | undefined;
  source: "HTTP" | "QSTASH" | "VERCEL_CRON" | "ZALO";
  requestId: string;
  ipHash?: string | undefined;
  userAgent?: string | undefined;
};

export async function resolveFinancialActorContext(params: {
  actorUserId: string | null;
  targetTenantId?: string;
  targetUserId?: string;
  source: "HTTP" | "QSTASH" | "VERCEL_CRON" | "ZALO";
  workerIdentity?: string;
  requestId: string;
  ipHash?: string;
  userAgent?: string;
}): Promise<FinancialActorContext> {
  const master = await masterTenant();
  const targetTenantId = params.targetTenantId ?? master.id;

  if (params.source === "QSTASH" || params.source === "VERCEL_CRON") {
    if (!params.workerIdentity) {
      throw new AppError("AUTH_REQUIRED", "Worker identity required for background calls.", 401);
    }
    return {
      actorUserId: params.actorUserId ?? null,
      actorRole: "SYSTEM_WORKER",
      workerIdentity: params.workerIdentity,
      targetTenantId,
      targetUserId: params.targetUserId,
      source: params.source,
      requestId: params.requestId,
      ipHash: params.ipHash,
      userAgent: params.userAgent
    };
  }

  if (!params.actorUserId) {
    throw new AppError("AUTH_REQUIRED", "Yêu cầu đăng nhập để thực hiện thao tác tài chính.", 401);
  }

  const tenantCtx = await resolveTenantContext(params.actorUserId);
  let role: FinancialActorRole = "TENANT_USER";

  if (tenantCtx.persona === "OWNER") {
    role = "OWNER";
    const target = await db.tenant.findUnique({ where: { id: targetTenantId } });
    if (!target) throw new AppError("NOT_FOUND", "Target tenant không tồn tại.", 404);
  } else if (tenantCtx.persona === "TENANT_MASTER") {
    role = "TENANT_MASTER";
    if (
      tenantCtx.ownedTenant?.id !== targetTenantId &&
      tenantCtx.memberTenant?.id !== targetTenantId
    ) {
      throw new AppError("FORBIDDEN", "Không có quyền quản trị tenant này.", 403);
    }
  } else {
    role = "TENANT_USER";
    if (tenantCtx.memberTenant?.id !== targetTenantId) {
      throw new AppError("FORBIDDEN", "Tài khoản không thuộc tenant này.", 403);
    }
  }

  return {
    actorUserId: params.actorUserId,
    actorRole: role,
    targetTenantId,
    targetUserId: params.targetUserId ?? params.actorUserId,
    source: params.source,
    requestId: params.requestId,
    ipHash: params.ipHash,
    userAgent: params.userAgent
  };
}

export async function revalidateFinancialActorContext(
  context: FinancialActorContext
): Promise<FinancialActorContext> {
  if (context.actorRole === "SYSTEM_WORKER") {
    if (!context.workerIdentity) {
      throw new AppError("AUTH_REQUIRED", "Internal execution identity is required.", 401);
    }
    if (!context.targetTenantId) {
      throw new AppError("VALIDATION_ERROR", "Internal execution tenant scope is required.", 400);
    }
    return context;
  }
  if (!context.actorUserId) {
    throw new AppError("AUTH_REQUIRED", "Yêu cầu đăng nhập.", 401);
  }
  const resolved = await resolveFinancialActorContext({
    actorUserId: context.actorUserId,
    targetTenantId: context.targetTenantId,
    ...(context.targetUserId ? { targetUserId: context.targetUserId } : {}),
    source: context.source,
    requestId: context.requestId,
    ...(context.ipHash ? { ipHash: context.ipHash } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {})
  });
  if (resolved.actorRole !== context.actorRole) {
    throw new AppError("FORBIDDEN", "Financial actor role không còn hợp lệ.", 403);
  }
  return resolved;
}

export async function requireTenantMasterContext(
  userId: string,
  targetTenantId?: string
): Promise<TenantContext> {
  const context = await resolveTenantContext(userId);
  if (context.persona === "OWNER") {
    if (targetTenantId) {
      const target = await db.tenant.findUnique({ where: { id: targetTenantId } });
      if (!target) throw new AppError("NOT_FOUND", "Tenant không tồn tại.", 404);
      return { ...context, ownedTenant: target };
    }
    return context;
  }
  if (context.persona !== "TENANT_MASTER" || !context.ownedTenant) {
    throw new AppError("FORBIDDEN", "Chỉ tenant master được thực hiện thao tác này.", 403);
  }
  if (targetTenantId && context.ownedTenant.id !== targetTenantId) {
    throw new AppError("FORBIDDEN", "Không quản lý target tenant được chọn.", 403);
  }
  return context;
}

export async function requireTenantUserContext(
  userId: string,
  expectedSlug?: string
): Promise<TenantContext> {
  const context = await resolveTenantContext(userId);
  if (context.persona !== "TENANT_USER" || !context.memberTenant) {
    throw new AppError("FORBIDDEN", "Chỉ tenant user được truy cập portal này.", 403);
  }
  if (expectedSlug && context.memberTenant.slug !== expectedSlug.toLowerCase().trim()) {
    throw new AppError("FORBIDDEN", "Tài khoản không thuộc tenant này.", 403);
  }
  return context;
}

export async function requireMasterMemberContext(userId: string): Promise<TenantContext> {
  const context = await resolveTenantContext(userId);
  if (
    context.persona !== "MASTER_MEMBER" &&
    context.persona !== "TENANT_MASTER" &&
    context.persona !== "OWNER"
  ) {
    throw new AppError("FORBIDDEN", "Portal này chỉ dành cho user của Owner.", 403);
  }
  return context;
}

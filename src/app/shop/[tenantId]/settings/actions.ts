"use server";

import { z } from "zod";
import { requireUser, requireApiRecentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import { createZaloBindingCode } from "@/lib/zalo";
import { createTenantCheckoutSession } from "@/lib/tenant";
import { ConnectorType, Platform, ProviderAccountScope } from "@/generated/prisma/client";
import { saveVerifiedProviderCredential } from "@/modules/connectors/provider-credentials";
import { stableHash } from "@/lib/crypto";

const affiliateConfigSchema = z.object({
  shopeeAffiliateId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/),
  memberSharePercent: z.number().int().min(1).max(100)
});

export async function updateTenantSettingsAction(rawInput: unknown) {
  const user = await requireUser();
  const input = affiliateConfigSchema.parse(rawInput);

  const current = await db.tenant.findUnique({
    where: { ownerUserId: user.id },
    select: {
      id: true,
      shopeeAffiliateId: true,
      memberShareBps: true
    }
  });
  if (!current) {
    throw new AppError("FORBIDDEN", "Bạn không sở hữu nhóm này.", 403);
  }

  const updated = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: current.id },
      data: {
        shopeeAffiliateId: input.shopeeAffiliateId,
        memberShareBps: input.memberSharePercent * 100
      },
      select: {
        id: true,
        shopeeAffiliateId: true,
        memberShareBps: true
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "tenant.affiliate_settings.updated",
        entityType: "Tenant",
        entityId: current.id,
        before: {
          affiliateIdChanged: current.shopeeAffiliateId !== input.shopeeAffiliateId,
          memberShareBps: current.memberShareBps
        },
        after: {
          affiliateIdChanged: current.shopeeAffiliateId !== input.shopeeAffiliateId,
          memberShareBps: tenant.memberShareBps
        }
      }
    });
    return tenant;
  });

  return {
    tenant: {
      shopeeAffiliateId: updated.shopeeAffiliateId,
      memberSharePercent: (updated.memberShareBps ?? 0) / 100
    }
  };
}

export async function createZaloBindingCodeAction() {
  const user = await requireUser();
  const limit = await rateLimit(`zalo-binding:${user.id}`, 5, 3600);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Bạn đã tạo quá nhiều mã liên kết.", 429);
  }

  const tenant = await db.tenant.findUnique({
    where: { ownerUserId: user.id },
    select: { id: true }
  });
  if (!tenant) throw new AppError("FORBIDDEN", "Bạn không sở hữu tenant.", 403);

  const result = await createZaloBindingCode({
    tenantId: tenant.id,
    ownerUserId: user.id
  });

  return {
    code: result.code,
    expiresAt: result.expiresAt.toISOString(),
    inviteUrl: loadServerEnv().NEXT_PUBLIC_ZALO_BOT_GROUP_INVITE_URL
  };
}

const checkoutSchema = z.object({
  tenantId: z.string().cuid(),
  planCode: z.enum([
    "STARTER_99K",
    "STARTER_YEARLY",
    "PRO_199K",
    "PRO_YEARLY",
    "PREMIUM_399K",
    "PREMIUM_YEARLY"
  ]),
  idempotencyKey: z.string().optional()
});

export async function createSaaSCheckoutSessionAction(rawInput: unknown) {
  const user = await requireUser();
  const input = checkoutSchema.parse(rawInput);
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();

  const limit = await rateLimit(`saas-checkout:${user.id}`, 10, 3600);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Bạn đã tạo quá nhiều yêu cầu thanh toán.", 429);
  }

  const ownedTenant = await db.tenant.findFirst({
    where: { id: input.tenantId, ownerUserId: user.id },
    select: { id: true }
  });
  if (!ownedTenant) {
    throw new AppError("FORBIDDEN", "Bạn không sở hữu nhóm này.", 403);
  }

  const session = await createTenantCheckoutSession({
    tenantId: input.tenantId,
    planCode: input.planCode,
    baseUrl: loadServerEnv().APP_BASE_URL,
    idempotencyKey,
    requestHash: stableHash(JSON.stringify(input))
  });

  return jsonSafe({ success: true, data: session });
}

const providerAccountInputSchema = z.object({
  provider: z.enum(["LAZADA_OPEN_API", "ACCESSTRADE_API"]),
  externalAccountId: z.string().trim().max(120),
  label: z.string().trim().min(2).max(120)
});

export async function createProviderAccountAction(rawInput: unknown) {
  const actor = await requireApiRecentUser();
  const limit = await rateLimit(`provider-account-create:${actor.id}`, 5, 3600);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Bạn tạo provider account quá nhanh.", 429);
  }

  const input = providerAccountInputSchema.parse(rawInput);
  const tenant = await db.tenant.findUnique({
    where: { ownerUserId: actor.id },
    select: { id: true, planId: true, planCode: true }
  });
  if (!tenant) throw new AppError("FORBIDDEN", "Bạn không sở hữu tenant.", 403);

  const platform = input.provider === "LAZADA_OPEN_API" ? Platform.LAZADA : Platform.ACCESSTRADE;
  const externalAccountId =
    input.externalAccountId || (input.provider === "ACCESSTRADE_API" ? "accesstrade" : "");

  const existing = await db.affiliateAccount.findFirst({
    where: {
      tenantId: tenant.id,
      connectorType: input.provider as ConnectorType
    }
  });

  if (existing) {
    return jsonSafe({ data: { id: existing.id } });
  }

  const created = await db.affiliateAccount.create({
    data: {
      tenantId: tenant.id,
      connectorType: input.provider as ConnectorType,
      scope: ProviderAccountScope.TENANT_MANAGED,
      platform,
      externalAccountId,
      label: input.label,
      enabled: false
    }
  });

  return jsonSafe({ data: { id: created.id } });
}

const credentialInputSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("LAZADA_OPEN_API"),
    appKey: z.string().trim().min(3).max(120),
    appSecret: z.string().trim().min(8).max(256),
    userToken: z.string().trim().min(8).max(1024),
    affiliateId: z.string().trim().min(3).max(120),
    validationHoldDays: z.number().int().min(4).max(60).optional()
  }),
  z.object({
    provider: z.literal("ACCESSTRADE_API"),
    apiKey: z.string().trim().min(16).max(256),
    publisherId: z.string().trim().max(120).optional(),
    validationHoldDays: z.number().int().min(4).max(60).optional()
  })
]);

export async function updateProviderCredentialAction(
  affiliateAccountId: string,
  rawInput: unknown
) {
  const actor = await requireApiRecentUser();
  const limit = await rateLimit(`provider-credential:${actor.id}`, 5, 60);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Bạn thao tác credential quá nhanh.", 429);
  }

  const input = credentialInputSchema.parse(rawInput);
  const account = await db.affiliateAccount.findUnique({
    where: { id: affiliateAccountId },
    include: { tenant: true }
  });

  if (!account || !account.tenantId || account.tenant?.ownerUserId !== actor.id) {
    throw new AppError("FORBIDDEN", "Bạn không quản lý provider account này.", 403);
  }

  const { validationHoldDays, ...credentialPayload } = input;
  const payload =
    credentialPayload.provider === "ACCESSTRADE_API"
      ? { ...credentialPayload, publisherId: credentialPayload.publisherId || "accesstrade" }
      : credentialPayload;

  const saved = await saveVerifiedProviderCredential({
    affiliateAccountId: account.id,
    actorUserId: actor.id,
    payload
  });

  if (validationHoldDays) {
    await db.affiliateAccount.update({
      where: { id: account.id },
      data: { validationHoldDays }
    });
  }

  return jsonSafe({
    data: {
      id: account.id,
      fingerprint: saved.fingerprint,
      status: "ACTIVE",
      validationHoldDays: validationHoldDays ?? account.validationHoldDays
    }
  });
}

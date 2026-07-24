"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ConnectorMode, ConnectorType, Platform, Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";

const optionalText = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
);

export async function upsertMerchantAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const input = z
    .object({
      platform: z.enum(Platform),
      code: z.string().trim().min(2).max(80),
      slug: z
        .string()
        .trim()
        .regex(/^[a-z0-9-]+$/)
        .max(80),
      name: z.string().trim().min(2).max(120),
      description: optionalText,
      defaultShareBps: z.coerce.number().int().min(0).max(10_000)
    })
    .parse(Object.fromEntries(formData));
  await db.$transaction(async (tx) => {
    const merchant = await tx.merchant.upsert({
      where: { platform_code: { platform: input.platform, code: input.code } },
      create: {
        platform: input.platform,
        code: input.code,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        defaultShareBps: input.defaultShareBps
      },
      update: {
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        defaultShareBps: input.defaultShareBps
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "merchant.upserted",
        entityType: "Merchant",
        entityId: merchant.id,
        after: {
          platform: merchant.platform,
          code: merchant.code,
          defaultShareBps: merchant.defaultShareBps
        }
      }
    });
  });
  revalidatePath("/admin/catalog");
}

export async function upsertCampaignAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const input = z
    .object({
      merchantId: z.string().cuid(),
      externalId: z.string().trim().min(1).max(160),
      slug: z
        .string()
        .trim()
        .regex(/^[a-z0-9-]+$/)
        .max(100),
      name: z.string().trim().min(2).max(160),
      allowedHosts: z.string().trim().min(1)
    })
    .parse(Object.fromEntries(formData));
  const allowedHosts = input.allowedHosts
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => /^[a-z0-9.-]+$/.test(host));
  if (allowedHosts.length === 0) throw new Error("Campaign phải có ít nhất một allowed host.");
  await db.$transaction(async (tx) => {
    const campaign = await tx.campaign.upsert({
      where: {
        merchantId_externalId: {
          merchantId: input.merchantId,
          externalId: input.externalId
        }
      },
      create: {
        merchantId: input.merchantId,
        externalId: input.externalId,
        slug: input.slug,
        name: input.name,
        metadata: { allowedHosts }
      },
      update: {
        slug: input.slug,
        name: input.name,
        active: true,
        metadata: { allowedHosts }
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "campaign.upserted",
        entityType: "Campaign",
        entityId: campaign.id,
        after: { externalId: input.externalId, allowedHosts }
      }
    });
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/app/links");
}

export async function upsertAffiliateAccountAction(formData: FormData) {
  const actor = await requireRole([Role.SUPER_ADMIN]);
  const input = z
    .object({
      connectorType: z.enum(ConnectorType),
      platform: z.enum(Platform),
      externalAccountId: z.string().trim().min(2).max(160),
      label: z.string().trim().min(2).max(160),
      mode: z.enum(ConnectorMode),
      enabled: z.coerce.boolean()
    })
    .parse({
      ...Object.fromEntries(formData),
      enabled: formData.get("enabled") === "true"
    });
  await db.$transaction(async (tx) => {
    const account = await tx.affiliateAccount.upsert({
      where: {
        connectorType_platform_externalAccountId: {
          connectorType: input.connectorType,
          platform: input.platform,
          externalAccountId: input.externalAccountId
        }
      },
      create: {
        connectorType: input.connectorType,
        platform: input.platform,
        externalAccountId: input.externalAccountId,
        label: input.label,
        enabled: input.enabled
      },
      update: { label: input.label, enabled: input.enabled }
    });
    await tx.connectorConfig.upsert({
      where: {
        connectorType_platform_affiliateAccountId: {
          connectorType: input.connectorType,
          platform: input.platform,
          affiliateAccountId: account.id
        }
      },
      create: {
        connectorType: input.connectorType,
        platform: input.platform,
        affiliateAccountId: account.id,
        mode: input.mode,
        enabled: input.enabled
      },
      update: { mode: input.mode, enabled: input.enabled }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "affiliate_account.upserted",
        entityType: "AffiliateAccount",
        entityId: account.id,
        after: {
          connectorType: input.connectorType,
          platform: input.platform,
          mode: input.mode,
          enabled: input.enabled
        }
      }
    });
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/connectors");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";

export async function toggleFlagAction(formData: FormData) {
  const user = await requireRole([Role.SUPER_ADMIN]);
  const key = String(formData.get("key"));
  const enabled = String(formData.get("enabled")) === "true";
  if (
    key === "payout.enabled" ||
    key === "cashback.release.enabled" ||
    key === "connector.shopee_food_cashback"
  ) {
    await requireRecentFinancePasskey(user.id);
  }
  await db.$transaction([
    db.featureFlag.upsert({
      where: { key },
      create: { key, enabled, updatedById: user.id },
      update: { enabled, updatedById: user.id }
    }),
    db.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "feature_flag.changed",
        entityType: "FeatureFlag",
        entityId: key,
        after: { enabled }
      }
    })
  ]);
  revalidatePath("/admin/flags");
}

export async function updatePayoutBudgetAction(formData: FormData) {
  const user = await requireRole([Role.SUPER_ADMIN]);
  await requireRecentFinancePasskey(user.id);
  const amountVnd = z.coerce
    .bigint()
    .min(500_000n)
    .max(1_000_000_000n)
    .parse(formData.get("amountVnd"));
  const key = "payout.daily_budget_vnd";
  await db.$transaction([
    db.featureFlag.upsert({
      where: { key },
      create: {
        key,
        enabled: true,
        value: { amountVnd: amountVnd.toString() },
        updatedById: user.id
      },
      update: {
        enabled: true,
        value: { amountVnd: amountVnd.toString() },
        updatedById: user.id
      }
    }),
    db.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "payout.daily_budget_changed",
        entityType: "FeatureFlag",
        entityId: key,
        after: { amountVnd: amountVnd.toString() }
      }
    })
  ]);
  revalidatePath("/admin/flags");
}

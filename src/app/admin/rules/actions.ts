"use server";

import { revalidatePath } from "next/cache";
import { Role, RuleScope } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";
import { createRuleVersion } from "@/modules/admin/rules";

export async function createRuleAction(formData: FormData) {
  const user = await requireRole([Role.SUPER_ADMIN]);
  await requireRecentFinancePasskey(user.id);
  await createRuleVersion({
    scope: RuleScope[String(formData.get("scope")) as keyof typeof RuleScope],
    shareBps: Number(formData.get("shareBps")),
    reason: String(formData.get("reason")),
    createdById: user.id,
    ...(formData.get("userId") ? { userId: String(formData.get("userId")) } : {}),
    ...(formData.get("merchantId") ? { merchantId: String(formData.get("merchantId")) } : {}),
    ...(formData.get("campaignId") ? { campaignId: String(formData.get("campaignId")) } : {})
  });
  revalidatePath("/admin/rules");
}

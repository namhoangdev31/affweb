"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import {
  approveAndPostAdjustment,
  createAdjustment,
  reviewAdjustment
} from "@/modules/admin/adjustments";

export async function createAdjustmentAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_REVIEWER, Role.SUPER_ADMIN]);
  await createAdjustment({
    targetUserId: String(formData.get("targetUserId")),
    amountVnd: BigInt(String(formData.get("amountVnd"))),
    reason: String(formData.get("reason")),
    createdByUserId: user.id
  });
  revalidatePath("/admin/adjustments");
}

export async function reviewAdjustmentAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_REVIEWER, Role.SUPER_ADMIN]);
  await reviewAdjustment(String(formData.get("adjustmentId")), user.id);
  revalidatePath("/admin/adjustments");
}

export async function approveAdjustmentAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  await approveAndPostAdjustment(String(formData.get("adjustmentId")), user.id);
  revalidatePath("/admin/adjustments");
}

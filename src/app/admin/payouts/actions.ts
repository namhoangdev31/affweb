"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { approvePayout, reviewPayout, submitPayout } from "@/modules/payout/service";

export async function reviewPayoutAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_REVIEWER, Role.SUPER_ADMIN]);
  await reviewPayout({
    payoutTicketId: String(formData.get("payoutTicketId")),
    reviewerUserId: user.id,
    comment: String(formData.get("comment") ?? "")
  });
  revalidatePath("/admin/payouts");
}

export async function approvePayoutAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  await approvePayout({
    payoutTicketId: String(formData.get("payoutTicketId")),
    approverUserId: user.id,
    comment: String(formData.get("comment") ?? "")
  });
  revalidatePath("/admin/payouts");
}

export async function submitPayoutAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  await submitPayout(String(formData.get("payoutTicketId")), user.id);
  revalidatePath("/admin/payouts");
}

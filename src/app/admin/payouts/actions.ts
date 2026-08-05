"use server";

import { revalidatePath } from "next/cache";
import { PayoutMethod, Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { requestId } from "@/lib/request";
import {
  completeManualPayout,
  markManualPayoutUnknown,
  resolveManualPayoutUnknown,
  startManualPayout
} from "@/modules/tenants/manual";
import {
  approvePayout,
  rejectPayout,
  requestPayoutReconciliation,
  resolveLegacyPayout,
  resumePayoutExecution
} from "@/modules/tenants/payout";
import { resolveFinancialActorContext } from "@/modules/tenants/persona";

export async function approveTenantPayoutAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  const reqId = await requestId();
  const payoutId = String(formData.get("payoutId"));
  const targetTenantId = String(formData.get("targetTenantId") ?? "");
  const note = String(formData.get("note") ?? "");
  const method = String(formData.get("method") ?? "") as PayoutMethod;
  if (!Object.values(PayoutMethod).includes(method)) {
    throw new Error("Payout method không hợp lệ.");
  }

  const ctx = await resolveFinancialActorContext({
    actorUserId: user.id,
    targetTenantId,
    source: "HTTP",
    requestId: reqId
  });

  await approvePayout(ctx, payoutId, method, note);
  revalidatePath("/admin/payouts");
}

async function adminActor(userId: string, targetTenantId: string) {
  return resolveFinancialActorContext({
    actorUserId: userId,
    targetTenantId,
    source: "HTTP",
    requestId: await requestId()
  });
}

export async function startManualPayoutAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  const targetTenantId = String(formData.get("targetTenantId") ?? "");
  await startManualPayout(
    await adminActor(user.id, targetTenantId),
    String(formData.get("payoutId"))
  );
  revalidatePath("/admin/payouts");
}

export async function completeManualPayoutAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  const targetTenantId = String(formData.get("targetTenantId") ?? "");
  await completeManualPayout(await adminActor(user.id, targetTenantId), {
    payoutId: String(formData.get("payoutId")),
    transferReference: String(formData.get("transferReference") ?? ""),
    evidenceReference: String(formData.get("evidenceReference") ?? ""),
    note: String(formData.get("note") ?? "")
  });
  revalidatePath("/admin/payouts");
}

export async function markManualUnknownAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  const targetTenantId = String(formData.get("targetTenantId") ?? "");
  await markManualPayoutUnknown(await adminActor(user.id, targetTenantId), {
    payoutId: String(formData.get("payoutId")),
    evidenceReference: String(formData.get("evidenceReference") ?? ""),
    note: String(formData.get("note") ?? "")
  });
  revalidatePath("/admin/payouts");
}

export async function resolveLegacyPayoutAction(formData: FormData) {
  const user = await requireRole([Role.SUPER_ADMIN]);
  const targetTenantId = String(formData.get("targetTenantId") ?? "");
  const providerReference = String(formData.get("providerReference") ?? "").trim();
  await resolveLegacyPayout(await adminActor(user.id, targetTenantId), {
    payoutId: String(formData.get("payoutId")),
    decision: String(formData.get("decision")) as
      "CONFIRMED_PAID" | "CONFIRMED_FAILED" | "CONFIRMED_NOT_SUBMITTED" | "REMAIN_UNKNOWN",
    evidenceReference: String(formData.get("evidenceReference") ?? ""),
    ...(providerReference ? { providerReference } : {}),
    reason: String(formData.get("reason") ?? "")
  });
  revalidatePath("/admin/payouts");
}

export async function rejectTenantPayoutAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  const reqId = await requestId();
  const payoutId = String(formData.get("payoutId"));
  const targetTenantId = String(formData.get("targetTenantId") ?? "");
  const reason = String(formData.get("reason") ?? "Rejected by admin");

  const ctx = await resolveFinancialActorContext({
    actorUserId: user.id,
    targetTenantId,
    source: "HTTP",
    requestId: reqId
  });

  await rejectPayout(ctx, payoutId, reason);
  revalidatePath("/admin/payouts");
}

export async function reconcileTenantPayoutAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  const reqId = await requestId();
  const payoutId = String(formData.get("payoutId"));
  const targetTenantId = String(formData.get("targetTenantId") ?? "");
  const ctx = await resolveFinancialActorContext({
    actorUserId: user.id,
    targetTenantId,
    source: "HTTP",
    requestId: reqId
  });
  await requestPayoutReconciliation(ctx, payoutId);
  revalidatePath("/admin/payouts");
}

export async function resumeTenantPayoutAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  const reqId = await requestId();
  const payoutId = String(formData.get("payoutId"));
  const targetTenantId = String(formData.get("targetTenantId") ?? "");
  const ctx = await resolveFinancialActorContext({
    actorUserId: user.id,
    targetTenantId,
    source: "HTTP",
    requestId: reqId
  });
  await resumePayoutExecution(ctx, payoutId);
  revalidatePath("/admin/payouts");
}

export async function resolveManualUnknownAction(formData: FormData) {
  const user = await requireRole([Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  const reqId = await requestId();
  const payoutId = String(formData.get("payoutId"));
  const targetTenantId = String(formData.get("targetTenantId") ?? "");
  const resolution = formData.get("resolution") as
    "CONFIRMED_PAID" | "CONFIRMED_NOT_SENT" | "REMAIN_UNKNOWN";
  const evidenceReference = String(formData.get("evidenceReference") ?? "");
  const note = String(formData.get("note") ?? "");

  const ctx = await resolveFinancialActorContext({
    actorUserId: user.id,
    targetTenantId,
    source: "HTTP",
    requestId: reqId
  });

  await resolveManualPayoutUnknown(ctx, {
    payoutId,
    resolution,
    evidenceReference,
    note
  });
  revalidatePath("/admin/payouts");
}

"use server";

import { revalidatePath } from "next/cache";
import { PayoutMethod } from "@/generated/prisma/client";
import { requireUser } from "@/lib/authz";
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
  resumePayoutExecution
} from "@/modules/tenants/payout";
import {
  requireTenantMasterContext,
  resolveFinancialActorContext
} from "@/modules/tenants/persona";

async function tenantMasterActor() {
  const user = await requireUser();
  const tenant = (await requireTenantMasterContext(user.id)).ownedTenant!;
  return resolveFinancialActorContext({
    actorUserId: user.id,
    targetTenantId: tenant.id,
    source: "HTTP",
    requestId: await requestId()
  });
}

export async function tenantApprovePayoutAction(formData: FormData) {
  const method = String(formData.get("method"));
  if (!Object.values(PayoutMethod).includes(method as PayoutMethod))
    throw new Error("Invalid method");
  await approvePayout(
    await tenantMasterActor(),
    String(formData.get("payoutId")),
    method as PayoutMethod,
    String(formData.get("note") ?? "")
  );
  revalidatePath("/shop/[tenantId]/payouts", "page");
}

export async function tenantRejectPayoutAction(formData: FormData) {
  await rejectPayout(
    await tenantMasterActor(),
    String(formData.get("payoutId")),
    String(formData.get("reason") ?? "")
  );
  revalidatePath("/shop/[tenantId]/payouts", "page");
}

export async function tenantPayoutOperationAction(formData: FormData) {
  const actor = await tenantMasterActor();
  const payoutId = String(formData.get("payoutId"));
  const operation = String(formData.get("operation"));
  if (operation === "resume") await resumePayoutExecution(actor, payoutId);
  else if (operation === "reconcile") await requestPayoutReconciliation(actor, payoutId);
  else if (operation === "manual-start") await startManualPayout(actor, payoutId);
  else if (operation === "manual-complete") {
    await completeManualPayout(actor, {
      payoutId,
      transferReference: String(formData.get("transferReference") ?? ""),
      evidenceReference: String(formData.get("evidenceReference") ?? ""),
      note: String(formData.get("note") ?? "")
    });
  } else if (operation === "manual-unknown") {
    await markManualPayoutUnknown(actor, {
      payoutId,
      evidenceReference: String(formData.get("evidenceReference") ?? ""),
      note: String(formData.get("note") ?? "")
    });
  } else if (operation === "manual-resolve") {
    await resolveManualPayoutUnknown(actor, {
      payoutId,
      resolution: String(formData.get("resolution")) as
        "CONFIRMED_PAID" | "CONFIRMED_NOT_SENT" | "REMAIN_UNKNOWN",
      evidenceReference: String(formData.get("evidenceReference") ?? ""),
      note: String(formData.get("note") ?? "")
    });
  } else throw new Error("Invalid payout operation");
  revalidatePath("/shop/[tenantId]/payouts", "page");
}

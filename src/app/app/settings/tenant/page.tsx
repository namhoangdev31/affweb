import type { Route } from "next";
import { redirect } from "next/navigation";
import { TenantSettingsClient } from "@/app/app/settings/tenant/tenant-settings-client";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";

export default async function TenantSettingsPage() {
  const user = await requireUser();
  const tenant = await db.tenant.findUnique({
    where: { ownerUserId: user.id }
  });
  if (!tenant) redirect("/onboarding/tenant" as Route);

  return (
    <TenantSettingsClient
      initialTenant={{
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        customDomain: tenant.customDomain,
        status: tenant.status,
        isTrial: tenant.isTrial,
        trialEndsAtLabel:
          tenant.trialEndsAt?.toLocaleDateString("vi-VN", { dateStyle: "long" }) ?? null,
        planId: tenant.planId,
        shopeeAffiliateId: tenant.shopeeAffiliateId ?? "",
        memberSharePercent: tenant.memberShareBps === null ? null : tenant.memberShareBps / 100
      }}
    />
  );
}

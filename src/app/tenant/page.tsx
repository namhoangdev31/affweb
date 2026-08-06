import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { resolveTenantContext } from "@/modules/tenants/persona";

export const dynamic = "force-dynamic";

export default async function LegacyTenantPageRedirect() {
  const user = await requireUser();
  const context = await resolveTenantContext(user.id);
  if (!context.ownedTenant) {
    redirect("/onboarding/tenant" as Route);
  }
  redirect(`/shop/${context.ownedTenant.id}` as Route);
}

import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { resolveTenantContext } from "@/modules/tenants/persona";

export const dynamic = "force-dynamic";

export default async function SmartTenantPageRedirect() {
  const user = await requireUser();
  const context = await resolveTenantContext(user.id);
  if (context.ownedTenant) {
    redirect(`/shop/${context.ownedTenant.id}` as Route);
  }
  if (context.memberTenant && context.memberTenant.kind === "STANDARD") {
    redirect(`/${context.memberTenant.slug}/app` as Route);
  }
  if (context.persona === "OWNER") {
    redirect("/app" as Route);
  }
  redirect("/onboarding/tenant" as Route);
}

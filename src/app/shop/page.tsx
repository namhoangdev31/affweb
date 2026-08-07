import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { resolveTenantContext } from "@/modules/tenants/persona";

export const dynamic = "force-dynamic";

/**
 * /shop smart-route — redirects TENANT_MASTER to their own shop portal.
 * Used as fallbackRedirectUrl for /shop/sign-in.
 */
export default async function ShopSmartRoute() {
  const user = await requireUser();
  const context = await resolveTenantContext(user.id);

  if (context.persona === "TENANT_MASTER" && context.ownedTenant) {
    redirect(`/shop/${context.ownedTenant.id}` as Route);
  }

  if (context.persona === "OWNER") {
    // Platform owner: go to /app (their portal)
    redirect("/app" as Route);
  }

  // No owned tenant yet → guide to create one
  redirect("/onboarding/tenant" as Route);
}

import type { Metadata } from "next";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/authz";
import { getTenantByHost } from "@/lib/tenant";
import { resolveTenantContext } from "@/modules/tenants/persona";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Custom domain check — redirect Standard Tenant domains to their slug portal
  const host = (await headers()).get("x-host") ?? "";
  const hostTenant = host ? await getTenantByHost(host) : null;
  if (hostTenant?.kind === "STANDARD") {
    redirect(`/${hostTenant.slug}/app` as Route);
  }

  // Persona-based portal enforcement:
  // - OWNER → /app ✅ (Platform Owner / Super Admin only)
  // - TENANT_MASTER → /shop/[tenantId] (KOC Owner Portal)
  // - TENANT_USER   → /[slug]/app      (KOC Member Portal)
  // - Regular sign-up user → /onboarding/tenant
  const context = await resolveTenantContext(user.id);
  if (context.persona === "TENANT_MASTER" && context.ownedTenant) {
    redirect(`/shop/${context.ownedTenant.id}` as Route);
  }
  if (context.memberTenant && context.memberTenant.kind === "STANDARD") {
    redirect(`/${context.memberTenant.slug}/app` as Route);
  }
  if (context.persona !== "OWNER") {
    redirect("/onboarding/tenant" as Route);
  }

  return <AppShell user={user}>{children}</AppShell>;
}

import type { Metadata } from "next";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { getTenantByHost } from "@/lib/tenant";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const host = (await headers()).get("x-host") ?? "";
  const hostTenant = host ? await getTenantByHost(host) : null;
  if (hostTenant?.kind === "STANDARD") {
    redirect(`/${hostTenant.slug}/app` as Route);
  }
  const ownedTenant = await db.tenant.findFirst({
    where: { ownerUserId: user.id }
  });
  const hasTenant = Boolean(ownedTenant);

  if (!hasTenant) {
    redirect("/onboarding/tenant" as Route);
  }

  return (
    <AppShell user={user} hasTenant={hasTenant}>
      {children}
    </AppShell>
  );
}

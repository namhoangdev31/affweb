import type { Metadata } from "next";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { getTenantByHost } from "@/lib/tenant";
import { requireMasterMemberContext } from "@/modules/tenants/persona";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const host = (await headers()).get("x-host") ?? "";
  const hostTenant = host ? await getTenantByHost(host) : null;
  if (hostTenant?.kind === "STANDARD") {
    redirect(`/${hostTenant.slug}/app` as Route);
  }
  try {
    await requireMasterMemberContext(user.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") {
      const dbUser = await db.user.findUnique({
        where: { id: user.id },
        select: { tenant: { select: { slug: true, kind: true } } }
      });
      if (dbUser?.tenant?.kind === "STANDARD" && dbUser.tenant.slug) {
        redirect(`/${dbUser.tenant.slug}/app` as Route);
      }
      redirect("/unauthorized" as Route);
    }
    throw error;
  }
  const ownedTenant = await db.tenant.findFirst({
    where: { ownerUserId: user.id }
  });
  const hasTenant = Boolean(ownedTenant);

  return (
    <AppShell user={user} hasTenant={hasTenant}>
      {children}
    </AppShell>
  );
}

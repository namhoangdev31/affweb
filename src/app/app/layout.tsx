import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
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

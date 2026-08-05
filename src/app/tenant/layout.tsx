import type { Metadata } from "next";
import { TenantMasterShell } from "@/components/tenant-master-shell";
import { requireUser } from "@/lib/authz";
import { requireTenantMasterContext } from "@/modules/tenants/persona";

export const metadata: Metadata = {
  title: "Tenant master",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

export default async function TenantMasterLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const context = await requireTenantMasterContext(user.id);
  return (
    <TenantMasterShell user={user} tenant={context.ownedTenant!}>
      {children}
    </TenantMasterShell>
  );
}

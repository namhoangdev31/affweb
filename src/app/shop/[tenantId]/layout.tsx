import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TenantMasterShell } from "@/components/tenant-master-shell";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { requireTenantMasterContext } from "@/modules/tenants/persona";

export const metadata: Metadata = {
  title: "Shop Master Portal",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

export default async function ShopTenantMasterLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const user = await requireUser();

  const tenant = await db.tenant.findFirst({
    where: {
      OR: [{ id: tenantId }, { slug: tenantId.toLowerCase() }]
    }
  });

  if (!tenant) {
    notFound();
  }

  const context = await requireTenantMasterContext(user.id, tenant.id);

  return (
    <TenantMasterShell user={user} tenant={context.ownedTenant!}>
      {children}
    </TenantMasterShell>
  );
}

import type { Metadata } from "next";
import { TenantUserShell } from "@/components/tenant-user-shell";
import { requireUser } from "@/lib/authz";
import { requireTenantUserContext } from "@/modules/tenants/persona";

export const metadata: Metadata = {
  title: "Tenant member",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

export default async function TenantUserLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const context = await requireTenantUserContext(user.id, slug);
  return (
    <TenantUserShell tenant={context.memberTenant!} user={user}>
      {children}
    </TenantUserShell>
  );
}

import type { Metadata } from "next";
import { Role } from "@/generated/prisma/client";
import { AdminShell } from "@/components/admin-shell";
import { requireRole } from "@/lib/authz";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole([Role.SUPPORT, Role.FINANCE_REVIEWER, Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  return <AdminShell>{children}</AdminShell>;
}

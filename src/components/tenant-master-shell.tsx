import { SignOutButton, UserButton } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import {
  Building2,
  CircleDollarSign,
  Landmark,
  LogOut,
  ReceiptText,
  Settings,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navigation = [
  { href: "/tenant", label: "Tổng quan", icon: Building2 },
  { href: "/tenant/treasury", label: "Treasury", icon: Landmark },
  { href: "/tenant/payouts", label: "Payout", icon: CircleDollarSign },
  { href: "/tenant/conversions", label: "Đơn & nghĩa vụ", icon: ReceiptText },
  { href: "/tenant/members", label: "Thành viên", icon: Users },
  { href: "/tenant/settings", label: "Cấu hình", icon: Settings }
] as const;

export function TenantMasterShell({
  children,
  tenant,
  user
}: {
  children: React.ReactNode;
  tenant: { name: string; slug: string; brandColor: string | null };
  user: { name?: string | null; email?: string | null };
}) {
  const brandColor = tenant.brandColor ?? "#0f766e";
  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-800 bg-slate-950 p-5 text-white lg:block">
        <Link href="/tenant" className="flex items-center gap-3">
          <span
            className="grid size-10 place-items-center rounded-xl font-bold"
            style={{ backgroundColor: brandColor }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </span>
          <span>
            <span className="block font-semibold">{tenant.name}</span>
            <span className="block text-xs text-slate-400">Tenant master portal</span>
          </span>
        </Link>
        <nav className="mt-9 grid gap-1" aria-label="Tenant master">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href as Route}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="absolute inset-x-5 bottom-5 border-t border-white/10 pt-4">
          <p className="truncate text-sm font-medium">{user.name ?? "Tenant master"}</p>
          <p className="truncate text-xs text-slate-400">{user.email}</p>
          <SignOutButton redirectUrl="/">
            <Button variant="ghost" size="sm" className="mt-3 w-full justify-start text-slate-300">
              <LogOut /> Đăng xuất
            </Button>
          </SignOutButton>
        </div>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/90 px-5 backdrop-blur lg:px-8">
          <Link href="/tenant" className="font-semibold lg:hidden">
            {tenant.name}
          </Link>
          <p className="hidden text-sm text-muted-foreground lg:block">/{tenant.slug}</p>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/app">
                <CircleDollarSign /> Ví cá nhân
              </Link>
            </Button>
            <UserButton userProfileUrl="/app/profile" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-5 pb-28 lg:p-8">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-white px-1 py-2 lg:hidden">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href as Route}
              className="grid justify-items-center gap-1 text-[10px] text-muted-foreground"
            >
              <Icon className="size-5" /> {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

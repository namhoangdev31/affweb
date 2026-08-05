import { SignOutButton, UserButton } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import {
  Bell,
  CircleDollarSign,
  LayoutDashboard,
  Link2,
  LogOut,
  ReceiptText,
  Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navigation = [
  { segment: "", label: "Tổng quan", icon: LayoutDashboard },
  { segment: "/links", label: "Tạo link", icon: Link2 },
  { segment: "/conversions", label: "Đơn hàng", icon: ReceiptText },
  { segment: "/wallet", label: "Ví", icon: CircleDollarSign },
  { segment: "/notifications", label: "Thông báo", icon: Bell },
  { segment: "/settings", label: "Cài đặt", icon: Settings }
] as const;

export function TenantUserShell({
  children,
  tenant,
  user
}: {
  children: React.ReactNode;
  tenant: { name: string; slug: string; brandColor: string | null };
  user: { name?: string | null; email?: string | null };
}) {
  const root = `/${tenant.slug}/app`;
  const brandColor = tenant.brandColor ?? "#059669";
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-800 bg-slate-950 p-5 lg:block">
        <Link href={root as Route} className="flex items-center gap-3">
          <span
            className="grid size-10 place-items-center rounded-xl font-bold"
            style={{ backgroundColor: brandColor }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </span>
          <span>
            <span className="block font-semibold">{tenant.name}</span>
            <span className="block text-xs text-slate-400">Member cashback</span>
          </span>
        </Link>
        <nav className="mt-9 grid gap-1" aria-label="Tenant member">
          {navigation.map(({ segment, label, icon: Icon }) => (
            <Link
              key={segment}
              href={`${root}${segment}` as Route}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="absolute inset-x-5 bottom-5 border-t border-white/10 pt-4">
          <p className="truncate text-sm font-medium">{user.name ?? "Thành viên"}</p>
          <p className="truncate text-xs text-slate-400">{user.email}</p>
          <SignOutButton redirectUrl={`/${tenant.slug}`}>
            <Button variant="ghost" size="sm" className="mt-3 w-full justify-start text-slate-300">
              <LogOut /> Đăng xuất
            </Button>
          </SignOutButton>
        </div>
      </aside>
      <div className="min-h-screen bg-slate-100 text-slate-950 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/90 px-5 backdrop-blur lg:px-8">
          <Link href={root as Route} className="font-semibold lg:hidden">
            {tenant.name}
          </Link>
          <p className="hidden text-sm text-muted-foreground lg:block">Kênh {tenant.name}</p>
          <UserButton userProfileUrl={`${root}/settings`} />
        </header>
        <main className="mx-auto max-w-6xl p-5 pb-28 lg:p-8">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-white px-1 py-2 lg:hidden">
          {navigation.map(({ segment, label, icon: Icon }) => (
            <Link
              key={segment}
              href={`${root}${segment}` as Route}
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

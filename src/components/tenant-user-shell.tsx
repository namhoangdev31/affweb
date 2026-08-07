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
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-800 bg-slate-950 p-5 text-white lg:block z-40">
        <Link href={root as Route} className="flex items-center gap-3">
          <span
            className="grid size-10 place-items-center rounded-xl font-bold shadow-md text-white"
            style={{ backgroundColor: brandColor }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">
            <span className="block font-bold text-white truncate">{tenant.name}</span>
            <span className="block text-xs text-slate-400">Tích điểm & Hoàn tiền</span>
          </span>
        </Link>
        <nav className="mt-9 grid gap-1.5" aria-label="Tenant member">
          {navigation.map(({ segment, label, icon: Icon }) => (
            <Link
              key={segment}
              href={`${root}${segment}` as Route}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-900 hover:text-white transition-all"
            >
              <Icon className="size-4 text-emerald-400" /> {label}
            </Link>
          ))}
        </nav>
        <div className="absolute inset-x-5 bottom-5 border-t border-slate-800/80 pt-4">
          <p className="truncate text-sm font-semibold text-slate-200">
            {user.name ?? "Thành viên"}
          </p>
          <p className="truncate text-xs text-slate-400">{user.email}</p>
          <SignOutButton redirectUrl={`/${tenant.slug}`}>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full justify-start text-slate-400 hover:text-white hover:bg-slate-900"
            >
              <LogOut className="mr-2 size-4" /> Đăng xuất
            </Button>
          </SignOutButton>
        </div>
      </aside>
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur lg:px-10">
          <Link href={root as Route} className="font-bold lg:hidden flex items-center gap-2">
            <span
              className="grid size-8 place-items-center rounded-lg font-bold text-white text-xs"
              style={{ backgroundColor: brandColor }}
            >
              {tenant.name.charAt(0).toUpperCase()}
            </span>
            <span>{tenant.name}</span>
          </Link>
          <p className="hidden text-sm font-medium text-muted-foreground lg:block">
            Kênh {tenant.name}
          </p>
          <UserButton userProfileUrl={`${root}/settings`} />
        </header>
        <main className="w-full flex-1 p-6 pb-28 lg:p-10">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-card px-1 py-2 lg:hidden">
          {navigation.map(({ segment, label, icon: Icon }) => (
            <Link
              key={segment}
              href={`${root}${segment}` as Route}
              className="grid justify-items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon className="size-5 text-emerald-600 dark:text-emerald-400" /> {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

import { SignOutButton, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Building2,
  CircleDollarSign,
  LayoutDashboard,
  Link2,
  LogOut,
  ReceiptText,
  Settings,
  Wrench,
  Sparkles,
  Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const desktopNav = [
  { href: "/app", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/app/links", label: "Tạo link", icon: Link2 },
  { href: "/app/conversions", label: "Đơn hàng", icon: ReceiptText },
  { href: "/app/reconciliation", label: "Hóa đơn đối soát", icon: ReceiptText },
  { href: "/app/wallet", label: "Ví cashback", icon: CircleDollarSign },
  { href: "/app/tools", label: "Công cụ", icon: Wrench },
  { href: "/app/leaderboard", label: "Bảng xếp hạng", icon: Trophy },
  { href: "/app/notifications", label: "Thông báo", icon: Bell },
  { href: "/app/settings", label: "Cài đặt", icon: Settings }
] as const;

const mobileBottomNav = [
  { href: "/app", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/app/links", label: "Tạo link", icon: Link2 },
  { href: "/app/conversions", label: "Đơn hàng", icon: ReceiptText },
  { href: "/app/wallet", label: "Ví cashback", icon: CircleDollarSign },
  { href: "/app/settings", label: "Cài đặt", icon: Settings }
] as const;

export function AppShell({
  children,
  user,
  hasTenant
}: {
  children: React.ReactNode;
  user: { name?: string | null; email?: string | null; image?: string | null };
  hasTenant?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#f5f3ec]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-[#102c24] p-5 text-white lg:block">
        <Link href="/app" className="flex items-center gap-2.5">
          <Image src="/brand-mark.svg" alt="" width={38} height={38} />
          <span className="font-semibold">Hoàn Tiền</span>
        </Link>
        <nav className="mt-10 grid gap-1" aria-label="Dashboard">
          {desktopNav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/8 hover:text-white"
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="absolute inset-x-5 bottom-5">
          <Separator className="mb-4 bg-white/10" />
          <p className="truncate text-sm font-medium">{user.name ?? "Thành viên"}</p>
          <p className="truncate text-xs text-white/45">{user.email}</p>
          <SignOutButton redirectUrl="/">
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full justify-start text-white/60 hover:bg-white/10 hover:text-white"
            >
              <LogOut /> Đăng xuất
            </Button>
          </SignOutButton>
        </div>
      </aside>
      <div className="lg:pl-64">
        {/* Global Sticky Banner for Direct Users without KOC Channel */}
        {!hasTenant ? (
          <div className="sticky top-0 z-40 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 px-4 py-2.5 text-white text-xs sm:text-sm font-medium flex flex-wrap items-center justify-between gap-3 shadow-lg border-b border-emerald-700/40">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-emerald-400 shrink-0 animate-pulse" />
              <span>
                🚀 <strong>Bạn chưa có Kênh KOC riêng?</strong> Dùng thử 14 ngày để quản lý member,
                link và đối soát tập trung.
              </span>
            </div>
            <Button
              asChild
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs h-7 px-3.5 rounded-full shrink-0 shadow-md"
            >
              <Link href="/onboarding/tenant">
                <Building2 className="mr-1 size-3.5" /> Tạo Kênh & Chọn Gói{" "}
                <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          </div>
        ) : null}

        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-[#f5f3ec]/90 px-5 backdrop-blur lg:px-8">
          <Link href="/app" className="flex items-center gap-2 lg:hidden">
            <Image src="/brand-mark.svg" alt="" width={34} height={34} />
            <span className="font-semibold">Hoàn Tiền</span>
          </Link>
          <p className="hidden text-sm text-muted-foreground lg:block">Cashback dashboard</p>
          <div className="flex items-center gap-3">
            <Button asChild size="sm">
              <Link href="/app/links">
                <Link2 /> Tạo link
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="icon"
              className="relative h-9 w-9 rounded-xl border-emerald-950/10"
            >
              <Link href="/app/notifications" title="Thông báo">
                <Bell className="size-4 text-emerald-950" />
                <span className="sr-only">Thông báo</span>
              </Link>
            </Button>
            <UserButton userProfileUrl="/app/profile" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-5 pb-28 lg:p-8">{children}</main>
        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card px-2 py-2 lg:hidden"
          aria-label="Điều hướng di động"
        >
          {mobileBottomNav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="grid justify-items-center gap-1 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon className="size-5" /> {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

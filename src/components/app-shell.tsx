import { SignOutButton, UserButton } from "@clerk/nextjs";
import Image from "next/image";
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
import { Separator } from "@/components/ui/separator";

const nav = [
  { href: "/app", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/app/links", label: "Tạo link", icon: Link2 },
  { href: "/app/conversions", label: "Đơn hàng", icon: ReceiptText },
  { href: "/app/wallet", label: "Ví cashback", icon: CircleDollarSign },
  { href: "/app/notifications", label: "Thông báo", icon: Bell },
  { href: "/app/settings", label: "Cài đặt", icon: Settings }
] as const;

export function AppShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: { name?: string | null; email?: string | null; image?: string | null };
}) {
  return (
    <div className="min-h-screen bg-[#f5f3ec]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-[#102c24] p-5 text-white lg:block">
        <Link href="/app" className="flex items-center gap-2.5">
          <Image src="/brand-mark.svg" alt="" width={38} height={38} />
          <span className="font-semibold">Hoàn Tiền</span>
        </Link>
        <nav className="mt-10 grid gap-1" aria-label="Dashboard">
          {nav.map(({ href, label, icon: Icon }) => (
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
            <UserButton userProfileUrl="/app/profile" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-5 pb-28 lg:p-8">{children}</main>
        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card px-2 py-2 lg:hidden"
          aria-label="Điều hướng di động"
        >
          {nav.slice(0, 5).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="grid justify-items-center gap-1 py-1 text-[10px] text-muted-foreground"
            >
              <Icon className="size-5" /> {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

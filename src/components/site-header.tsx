"use client";

import { Show, UserButton } from "@clerk/nextjs";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const links = [
  { href: "/#cach-hoat-dong", label: "Cách hoạt động" },
  { href: "/deals", label: "Ưu đãi" },
  { href: "/partners", label: "Đối tác" },
  { href: "/faq", label: "Hỏi đáp" }
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Hoàn Tiền - Trang chủ">
          <Image src="/brand-mark.svg" alt="" width={38} height={38} priority />
          <span className="text-lg font-semibold tracking-tight">Hoàn Tiền</span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Điều hướng chính">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href as Route}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Show when="signed-out">
            <Button variant="ghost" asChild>
              <Link href={"/shop/sign-in" as Route}>Đăng nhập</Link>
            </Button>
            <Button asChild>
              <Link href={"/onboarding/tenant" as Route}>Bắt đầu nhận tiền</Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Button variant="outline" asChild>
              <Link href="/tenant">Vào Dashboard</Link>
            </Button>
            <UserButton userProfileUrl="/app/profile" />
          </Show>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Mở menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Hoàn Tiền</SheetTitle>
            </SheetHeader>
            <nav className="mt-8 grid gap-5" aria-label="Điều hướng di động">
              {links.map((link) => (
                <Link key={link.href} href={link.href as Route} className="text-lg">
                  {link.label}
                </Link>
              ))}
              <Show when="signed-out">
                <Button asChild className="mt-4">
                  <Link href={"/shop/sign-in" as Route}>Đăng nhập</Link>
                </Button>
                <Button variant="outline" asChild className="mt-2">
                  <Link href={"/onboarding/tenant" as Route}>Tạo tài khoản</Link>
                </Button>
              </Show>
              <Show when="signed-in">
                <Button asChild className="mt-4">
                  <Link href="/tenant">Vào Dashboard</Link>
                </Button>
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
                  <span className="text-sm font-medium text-muted-foreground">Tài khoản</span>
                  <UserButton userProfileUrl="/app/profile" />
                </div>
              </Show>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
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
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost">Đăng nhập</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button>Bắt đầu nhận tiền</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Button variant="ghost" asChild>
              <Link href="/app">Dashboard</Link>
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
                <Link key={link.href} href={link.href} className="text-lg">
                  {link.label}
                </Link>
              ))}
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <Button className="mt-4">Đăng nhập</Button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <Button asChild className="mt-4">
                  <Link href="/app">Mở dashboard</Link>
                </Button>
              </Show>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

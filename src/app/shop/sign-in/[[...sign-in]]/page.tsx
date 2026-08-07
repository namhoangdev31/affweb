import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { ClerkSessionSanitizer } from "@/components/clerk-session-sanitizer";
import { Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Đăng nhập — Quản lý Kênh KOC",
  robots: { index: false, follow: false }
};

export default function TenantMasterSignInPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100 overflow-hidden">
      {/* Glow background effects for KOC Portal */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[40rem] rounded-full bg-amber-500/10 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 -translate-x-1/2 size-[32rem] rounded-full bg-emerald-500/10 blur-[120px]" />

      <ClerkSessionSanitizer />
      <div className="relative z-10 flex flex-col items-center w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 px-3 py-1 font-semibold">
            <Store className="mr-1.5 size-4 inline" /> Quản Trị Kênh KOC
          </Badge>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Cổng Quản trị Kênh KOC
          </h1>
          <p className="text-sm text-slate-400">
            Đăng nhập tài khoản quản trị để quản lý Quỹ Treasury, duyệt lệnh Rút tiền và cài đặt
            Shopee Affiliate ID.
          </p>
        </div>

        <SignIn
          routing="path"
          path="/shop/sign-in"
          signUpUrl="/shop/sign-up"
          fallbackRedirectUrl="/shop"
        />

        <div className="flex items-center justify-center w-full pt-4 border-t border-slate-800/80 text-sm text-slate-400">
          <Link
            href="/shop/sign-up"
            className="font-bold text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1.5 transition-colors"
          >
            <Store className="size-4" /> Chưa có tài khoản? Đăng ký mở Kênh KOC mới
          </Link>
        </div>
      </div>
    </main>
  );
}

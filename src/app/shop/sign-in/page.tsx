import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { ClerkSessionSanitizer } from "@/components/clerk-session-sanitizer";
import { Shield, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Đăng nhập KOC Master — Quản trị Kênh Affiliate",
  robots: { index: false, follow: false }
};

export default function TenantMasterSignInPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100 overflow-hidden">
      {/* Glow background effects for KOC Master Portal */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[40rem] rounded-full bg-amber-500/10 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 -translate-x-1/2 size-[32rem] rounded-full bg-emerald-500/10 blur-[120px]" />

      <ClerkSessionSanitizer />
      <div className="relative z-10 flex flex-col items-center w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 px-3 py-1 font-semibold">
            <Store className="mr-1.5 size-4 inline" /> KOC Master Portal
          </Badge>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Cổng Quản trị Kênh KOC
          </h1>
          <p className="text-sm text-slate-400">
            Đăng nhập tài khoản Owner để quản lý Quỹ Treasury, duyệt lệnh Rút tiền và cài đặt Shopee
            Affiliate ID.
          </p>
        </div>

        <SignIn
          routing="path"
          path="/shop/sign-in"
          signUpUrl="/onboarding/tenant"
          fallbackRedirectUrl="/tenant"
        />

        <div className="flex items-center justify-between w-full pt-4 border-t border-slate-800/80 text-xs text-slate-400">
          <Link
            href="/sign-in"
            className="hover:text-emerald-400 transition-colors flex items-center gap-1"
          >
            <Shield className="size-3.5" /> Đăng nhập Ví Cashback Cá nhân (/app)
          </Link>
          <Link href="/onboarding/tenant" className="font-bold text-amber-400 hover:underline">
            Mở Kênh KOC mới
          </Link>
        </div>
      </div>
    </main>
  );
}

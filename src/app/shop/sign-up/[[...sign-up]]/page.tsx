import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { ClerkSessionSanitizer } from "@/components/clerk-session-sanitizer";
import { Store, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Đăng ký — Khởi Tạo Kênh Săn Sale",
  robots: { index: false, follow: false }
};

export default function TenantMasterSignUpPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100 overflow-hidden">
      {/* Glow background effects */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[40rem] rounded-full bg-amber-500/10 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 -translate-x-1/2 size-[32rem] rounded-full bg-emerald-500/10 blur-[120px]" />

      <ClerkSessionSanitizer />
      <div className="relative z-10 flex flex-col items-center w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 px-3 py-1 font-semibold">
            <Sparkles className="mr-1.5 size-4 inline text-amber-400" /> Mở Kênh Săn Sale Riêng
          </Badge>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Tạo Kênh Affiliate Cá Nhân
          </h1>
          <p className="text-sm text-slate-400">
            Tạo Kênh riêng để chia sẻ link Shopee cho cộng đồng của bạn với 14 ngày dùng thử miễn
            phí.
          </p>
        </div>

        <SignUp
          routing="path"
          path="/shop/sign-up"
          signInUrl="/shop/sign-in"
          fallbackRedirectUrl="/onboarding/tenant"
        />

        <div className="flex items-center justify-center w-full pt-4 border-t border-slate-800/80 text-sm text-slate-400">
          <Link
            href="/shop/sign-in"
            className="font-bold text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1.5 transition-colors"
          >
            <Store className="size-4" /> Đã có tài khoản? Đăng nhập ngay
          </Link>
        </div>
      </div>
    </main>
  );
}

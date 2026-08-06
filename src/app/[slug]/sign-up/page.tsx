import { SignUp } from "@clerk/nextjs";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantBySlug } from "@/lib/tenant";
import { ClerkSessionSanitizer } from "@/components/clerk-session-sanitizer";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SYSTEM_RESERVED_SLUGS = new Set([
  "admin",
  "app",
  "shop",
  "tenant",
  "api",
  "t",
  "deals",
  "login",
  "sign-in",
  "sign-up",
  "privacy",
  "terms",
  "faq",
  "go",
  "shopee-lookup",
  "partners",
  "cashback-policy",
  "offline",
  "onboarding"
]);

export default async function TenantMemberSignUpPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cleanSlug = slug.toLowerCase().trim();

  if (SYSTEM_RESERVED_SLUGS.has(cleanSlug)) {
    return notFound();
  }

  const tenant = await getTenantBySlug(cleanSlug);
  if (!tenant) {
    return notFound();
  }

  const brandColor = tenant.brandColor || "#059669";
  const redirectTarget = `/${tenant.slug}/app`;

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100 overflow-hidden">
      {/* Glow background effects using tenant brand color */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[40rem] rounded-full opacity-20 blur-[140px]"
        style={{ backgroundColor: brandColor }}
      />

      <ClerkSessionSanitizer />
      <div className="relative z-10 flex flex-col items-center w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Badge
            className="border-emerald-500/30 px-3 py-1 font-semibold"
            style={{ backgroundColor: `${brandColor}33`, color: brandColor }}
          >
            <Sparkles className="mr-1.5 size-4 inline" /> Kênh KOC: {tenant.name}
          </Badge>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Tạo tài khoản Thành viên {tenant.name}
          </h1>
          <p className="text-sm text-slate-400">
            Đăng ký để tham gia cộng đồng Kênh {tenant.name} và nhận cashback theo tỷ lệ chia ưu
            đãi.
          </p>
        </div>

        <SignUp
          routing="path"
          path={`/${tenant.slug}/sign-up`}
          signInUrl={`/${tenant.slug}/sign-in`}
          fallbackRedirectUrl={redirectTarget}
        />

        <p className="text-center text-xs text-slate-400">
          Đã có tài khoản Kênh?{" "}
          <Link
            href={`/${tenant.slug}/sign-in`}
            className="font-bold underline hover:text-white transition-colors"
            style={{ color: brandColor }}
          >
            Đăng nhập Kênh ngay
          </Link>
        </p>
      </div>
    </main>
  );
}

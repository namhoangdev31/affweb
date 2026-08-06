import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/tenant";
import { getAppHostDisplay } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, Link2, ShoppingBag, Sparkles, Store } from "lucide-react";
import Link from "next/link";

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
  "onboarding",
  "manifest.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "sw.js"
]);

export default async function TenantDirectSlugPage({
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

  const brandColor = tenant.brandColor || "#173b31";
  const active =
    (tenant.status === "TRIAL" || tenant.status === "ACTIVE") && tenant.planExpiresAt > new Date();

  if (!active) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
        <Card className="max-w-lg border-slate-800 bg-slate-900 text-white">
          <CardHeader>
            <CardTitle>Kênh {tenant.name} đang tạm dừng</CardTitle>
            <CardDescription>
              Tenant đã hết hạn hoặc bị đình chỉ. Hệ thống không tạo link và không tự fallback sang
              Affiliate ID nền tảng.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="grid size-10 place-items-center rounded-xl font-bold text-white shadow-md"
              style={{ backgroundColor: brandColor }}
            >
              {tenant.name.charAt(0)}
            </div>
            <div>
              <p className="font-bold text-base leading-none text-white">{tenant.name}</p>
              <p className="text-xs text-slate-400 mt-1">Kênh Săn Sale Cashback Chính Thức</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              <Link href={`/${tenant.slug}/sign-in`}>Đăng nhập</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
            >
              <Link href={`/${tenant.slug}/sign-up`}>Đăng ký thành viên</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="relative overflow-hidden py-16 px-4 text-center">
        <div className="mx-auto max-w-3xl space-y-6">
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 px-3 py-1">
            <Sparkles className="mr-1 size-3.5" /> Kênh Đại Lý KOC Nền Tảng: {getAppHostDisplay()}/
            {tenant.slug}
          </Badge>

          <h1 className="display-type text-4xl sm:text-5xl font-extrabold tracking-tight">
            Tạo link mua sắm Shopee. <br />
            <span style={{ color: brandColor === "#173b31" ? "#10b981" : brandColor }}>
              Tỷ lệ chia được snapshot minh bạch.
            </span>
          </h1>

          <p className="text-base text-slate-300 max-w-xl mx-auto">
            Chào mừng bạn đến với kênh của <strong>{tenant.name}</strong>. Cashback của member được
            owner đối soát từ report Shopee và thanh toán bên ngoài nền tảng.
          </p>

          {/* Quick Link Converter Form */}
          <Card className="border-slate-800 bg-slate-900/90 text-left shadow-2xl backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Link2 className="size-4 text-emerald-400" /> Dán link sản phẩm Shopee
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                action={`/${tenant.slug}/app/links`}
                method="GET"
                className="flex flex-col sm:flex-row gap-3"
              >
                <Input
                  name="url"
                  placeholder="Dán đường dẫn sản phẩm Shopee tại đây..."
                  className="flex-1 border-slate-800 bg-slate-950 text-white placeholder:text-slate-500 focus:border-emerald-500"
                />
                <Button
                  type="submit"
                  className="bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
                >
                  Tạo Link Hoàn Tiền
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <div className="grid gap-6 sm:grid-cols-3">
          <Card className="border-slate-800 bg-slate-900 text-white">
            <CardHeader className="pb-2">
              <ShoppingBag className="size-8 text-emerald-400 mb-2" />
              <CardTitle className="text-lg">Đối soát bằng report</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400">
              Conversion chỉ được ghi nhận sau khi owner nhập report Shopee hợp lệ; không cộng vào
              ví nền tảng.
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900 text-white">
            <CardHeader className="pb-2">
              <Store className="size-8 text-amber-400 mb-2" />
              <CardTitle className="text-lg">Độc quyền Kênh {tenant.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400">
              Tỷ lệ chia của member được snapshot tại thời điểm tạo link và không thay đổi theo cấu
              hình về sau.
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900 text-white">
            <CardHeader className="pb-2">
              <Building2 className="size-8 text-blue-400 mb-2" />
              <CardTitle className="text-lg">Owner thanh toán bên ngoài</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400">
              Owner chịu trách nhiệm xác nhận và thanh toán cashback cho member ngoài hệ thống.
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { registerTenantWithTrial, PLAN_PRESETS } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, Crown, Sparkles, Store, Zap } from "lucide-react";

async function createTenantAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  const name = formData.get("name") as string;
  const slug = (formData.get("slug") as string)?.toLowerCase().trim();
  const brandColor = (formData.get("brandColor") as string) || "#173b31";
  const selectedPlan = (formData.get("planCode") as string) || "PRO_199K";

  if (!name || !slug) {
    redirect("/onboarding/tenant?error=missing_fields");
  }

  // Check unique slug
  const existing = await db.tenant.findUnique({ where: { slug } });
  if (existing) {
    redirect("/onboarding/tenant?error=slug_taken");
  }

  // Create tenant with trial and chosen plan code
  const tenant = await registerTenantWithTrial({
    name,
    slug,
    ownerUserId: user.id
  });

  // Update tenant details
  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      brandColor,
      planId: selectedPlan
    }
  });

  await db.user.update({
    where: { id: user.id },
    data: { tenantId: tenant.id }
  });

  redirect("/app?onboarding=success");
}

export default async function TenantOnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  // Check if user is already a Tenant Owner
  const existingTenant = await db.tenant.findFirst({
    where: { ownerUserId: user.id }
  });

  if (existingTenant) {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12 text-white flex items-center justify-center">
      <div className="w-full max-w-4xl space-y-8">
        {/* Title Header */}
        <div className="text-center space-y-3">
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-3 py-1 text-xs">
            <Sparkles className="mr-1.5 size-4" /> Khởi Tạo Kênh KOC / Affiliate Thương Hiệu Riêng
          </Badge>
          <h1 className="display-type text-3xl sm:text-5xl font-extrabold tracking-tight">
            Khởi Tạo Kênh KOC Đại Lý.
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
            Sở hữu thương hiệu Cashback & Affiliate riêng với <strong>14 ngày dùng thử miễn phí đầy đủ tính năng</strong> (bao gồm Bot Zalo tự động nhóm chat).
          </p>
        </div>

        {params.error === "slug_taken" ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
            ⚠️ Slug URL đường dẫn này đã có người sử dụng. Vui lòng chọn đường dẫn slug khác.
          </div>
        ) : null}

        {params.error === "missing_fields" ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-sm text-amber-400">
            ⚠️ Vui lòng điền đầy đủ Tên Kênh KOC và Đường dẫn Slug URL.
          </div>
        ) : null}

        <form action={createTenantAction} className="space-y-8">
          {/* Section 1: Tenant Information */}
          <Card className="border-slate-800 bg-slate-900 text-white shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Store className="size-5 text-emerald-400" /> 1. Thiết Lập Thông Tin Kênh KOC
              </CardTitle>
              <CardDescription className="text-slate-400">
                Nhập tên đại lý, đường dẫn trực tiếp và màu sắc nhận diện thương hiệu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-200 font-medium">Tên Kênh KOC / Thương hiệu</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Ví dụ: Săn Sale Cùng Nam, KOC Review Chất..."
                    required
                    className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug" className="text-slate-200 font-medium">Đường dẫn Trực tiếp Kênh KOC</Label>
                  <div className="flex rounded-md border border-slate-800 bg-slate-950 overflow-hidden">
                    <span className="bg-slate-900 px-3 py-2 text-xs text-slate-400 border-r border-slate-800 flex items-center">
                      affweb.vn/
                    </span>
                    <Input
                      id="slug"
                      name="slug"
                      placeholder="sansale-nam"
                      required
                      className="border-0 bg-transparent text-white placeholder:text-slate-600 focus:ring-0 focus-visible:ring-0"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="brandColor" className="text-slate-200 font-medium">Màu sắc nhận diện (Brand Color)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="brandColor"
                    name="brandColor"
                    type="color"
                    defaultValue="#173b31"
                    className="size-10 rounded-lg p-0.5 border-slate-800 bg-slate-950 cursor-pointer"
                  />
                  <span className="text-xs text-slate-400 font-mono">Tự chọn màu sắc chủ đạo hiển thị trên trang KOC của bạn</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Subscription Plan Selector */}
          <Card className="border-slate-800 bg-slate-900 text-white shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Crown className="size-5 text-amber-400" /> 2. Chọn Gói Dịch Vụ SaaS KOC (Miễn Phí 14 Ngày Đầu)
              </CardTitle>
              <CardDescription className="text-slate-400">
                Tất cả các gói đều nhận 14 ngày dùng thử miễn phí full tính năng. Không mất phí đăng ký ban đầu.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Plan 1: Starter */}
                <label className="relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-5 cursor-pointer hover:border-slate-700 transition">
                  <input type="radio" name="planCode" value="STARTER_99K" className="sr-only peer" />
                  <div className="peer-checked:border-emerald-500 border border-transparent rounded-xl absolute inset-0 pointer-events-none" />
                  <div className="space-y-2">
                    <Badge variant="outline" className="border-slate-700 text-slate-300">STARTER</Badge>
                    <p className="text-2xl font-bold">99.000 ₫ <span className="text-xs font-normal text-slate-400">/tháng</span></p>
                    <p className="text-xs text-slate-400">Dành cho KOC mới khởi tạo nhóm nhỏ dưới 500 thành viên.</p>
                  </div>
                  <ul className="mt-4 text-xs text-slate-300 space-y-1.5 border-t border-slate-900 pt-3">
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-400" /> Tối đa 500 thành viên</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-400" /> Đổi link Shopee tự động</li>
                  </ul>
                </label>

                {/* Plan 2: Pro (Recommended) */}
                <label className="relative flex flex-col justify-between rounded-xl border-2 border-emerald-500 bg-emerald-950/20 p-5 cursor-pointer shadow-lg">
                  <input type="radio" name="planCode" value="PRO_199K" defaultChecked className="sr-only peer" />
                  <div className="peer-checked:ring-2 peer-checked:ring-emerald-400 rounded-xl absolute inset-0 pointer-events-none" />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-emerald-600 text-white">PRO (KHUYÊN DÙNG)</Badge>
                      <Sparkles className="size-4 text-amber-400" />
                    </div>
                    <p className="text-2xl font-bold text-emerald-400">199.000 ₫ <span className="text-xs font-normal text-slate-400">/tháng</span></p>
                    <p className="text-xs text-slate-300">Gói phổ biến nhất có tích hợp Bot Zalo nhóm chat tự động.</p>
                  </div>
                  <ul className="mt-4 text-xs text-slate-200 space-y-1.5 border-t border-emerald-900/50 pt-3">
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-400" /> Tối đa 3.000 thành viên</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-400" /> Full Bot Zalo Nhóm Chat</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-400" /> Shopee & AccessTrade API</li>
                  </ul>
                </label>

                {/* Plan 3: Business */}
                <label className="relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-5 cursor-pointer hover:border-slate-700 transition">
                  <input type="radio" name="planCode" value="PREMIUM_399K" className="sr-only peer" />
                  <div className="peer-checked:border-emerald-500 border border-transparent rounded-xl absolute inset-0 pointer-events-none" />
                  <div className="space-y-2">
                    <Badge variant="outline" className="border-purple-500/40 text-purple-400">BUSINESS</Badge>
                    <p className="text-2xl font-bold">399.000 ₫ <span className="text-xs font-normal text-slate-400">/tháng</span></p>
                    <p className="text-xs text-slate-400">Dành cho cộng đồng lớn quy mô trên 20.000 thành viên.</p>
                  </div>
                  <ul className="mt-4 text-xs text-slate-300 space-y-1.5 border-t border-slate-900 pt-3">
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-purple-400" /> Tối đa 20.000 thành viên</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-purple-400" /> Không giới hạn lượt click</li>
                  </ul>
                </label>
              </div>

              {/* Free Trial Guarantee Callout */}
              <div className="mt-6 rounded-xl bg-slate-950 p-4 border border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Zap className="size-5 text-amber-400 shrink-0" />
                  <p className="text-xs text-slate-300">
                    🎁 Bạn sẽ nhận <strong>14 ngày Dùng Thử Miễn Phí</strong> ngay sau khi bấm Kích hoạt. Hệ thống chỉ yêu cầu thanh toán khi hết hạn dùng thử.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full h-12 bg-emerald-600 font-bold text-white hover:bg-emerald-500 text-base shadow-xl">
            <Building2 className="mr-2 size-5" /> Kích Hoạt Kênh KOC & Bắt Đầu Ngay (Miễn Phí 14 Ngày)
          </Button>
        </form>
      </div>
    </div>
  );
}

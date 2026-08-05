import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { registerTenantWithTrial } from "@/lib/tenant";
import { getAppHostDisplay } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, Crown, Sparkles, Store, Zap } from "lucide-react";
import { requireMasterMemberContext } from "@/modules/tenants/persona";

async function createTenantAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  await requireMasterMemberContext(user.id);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(63)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      shopeeAffiliateId: z
        .string()
        .trim()
        .regex(/^\d{5,30}$/),
      memberSharePercent: z.coerce.number().int().min(1).max(100),
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      planCode: z.enum(["STARTER_99K", "PRO_199K", "PREMIUM_399K"])
    })
    .safeParse({
      name: formData.get("name"),
      slug: formData.get("slug"),
      shopeeAffiliateId: formData.get("shopeeAffiliateId"),
      memberSharePercent: formData.get("memberSharePercent"),
      brandColor: formData.get("brandColor") || "#173b31",
      planCode: formData.get("planCode") || "PRO_199K"
    });

  if (!parsed.success) {
    redirect("/onboarding/tenant?error=missing_fields" as Route);
  }
  const { name, slug, shopeeAffiliateId, memberSharePercent, brandColor } = parsed.data;

  const [existingSlug, existingOwner] = await Promise.all([
    db.tenant.findUnique({ where: { slug } }),
    db.tenant.findUnique({ where: { ownerUserId: user.id } })
  ]);
  if (existingSlug) {
    redirect("/onboarding/tenant?error=slug_taken" as Route);
  }
  if (existingOwner) redirect("/tenant/settings" as Route);

  await db.$transaction(async (tx) => {
    const tenant = await registerTenantWithTrial(
      {
        name,
        slug,
        ownerUserId: user.id,
        shopeeAffiliateId,
        memberShareBps: memberSharePercent * 100
      },
      tx
    );
    await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        brandColor
      }
    });
  });

  redirect("/tenant?onboarding=success" as Route);
}

export default async function TenantOnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  await requireMasterMemberContext(user.id);
  const params = await searchParams;

  // Check if user is already a Tenant Owner
  const existingTenant = await db.tenant.findFirst({
    where: { ownerUserId: user.id }
  });

  if (existingTenant) {
    redirect("/tenant" as Route);
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
            Sở hữu kênh Shopee Affiliate riêng với <strong>14 ngày dùng thử miễn phí</strong>.
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
                  <Label htmlFor="name" className="text-slate-200 font-medium">
                    Tên Kênh KOC / Thương hiệu
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Ví dụ: Săn Sale Cùng Nam, KOC Review Chất..."
                    required
                    className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug" className="text-slate-200 font-medium">
                    Đường dẫn Trực tiếp Kênh KOC
                  </Label>
                  <div className="flex rounded-md border border-slate-800 bg-slate-950 overflow-hidden">
                    <span className="bg-slate-900 px-3 py-2 text-xs text-slate-400 border-r border-slate-800 flex items-center">
                      {getAppHostDisplay()}/
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
                <Label htmlFor="brandColor" className="text-slate-200 font-medium">
                  Màu sắc nhận diện (Brand Color)
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="brandColor"
                    name="brandColor"
                    type="color"
                    defaultValue="#173b31"
                    className="size-10 rounded-lg p-0.5 border-slate-800 bg-slate-950 cursor-pointer"
                  />
                  <span className="text-xs text-slate-400 font-mono">
                    Tự chọn màu sắc chủ đạo hiển thị trên trang KOC của bạn
                  </span>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="shopeeAffiliateId" className="font-medium text-slate-200">
                    Shopee Affiliate ID
                  </Label>
                  <Input
                    id="shopeeAffiliateId"
                    name="shopeeAffiliateId"
                    inputMode="numeric"
                    pattern="[0-9]{5,30}"
                    placeholder="Ví dụ: 17330520179"
                    required
                    className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 focus:border-emerald-500"
                  />
                  <p className="text-xs text-slate-400">
                    Link của thành viên trong nhóm sẽ được tạo bằng Affiliate ID này.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="memberSharePercent" className="font-medium text-slate-200">
                    Phần trăm hoàn cho member
                  </Label>
                  <div className="relative">
                    <Input
                      id="memberSharePercent"
                      name="memberSharePercent"
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      placeholder="Ví dụ: 70"
                      required
                      className="border-slate-800 bg-slate-950 pr-12 text-white placeholder:text-slate-600 focus:border-emerald-500"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      %
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Hệ thống trừ 10% thuế ước tính rồi mới áp dụng tỷ lệ này.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Subscription Plan Selector */}
          <Card className="border-slate-800 bg-slate-900 text-white shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Crown className="size-5 text-amber-400" /> 2. Chọn Gói Dịch Vụ SaaS KOC (Miễn Phí
                14 Ngày Đầu)
              </CardTitle>
              <CardDescription className="text-slate-400">
                Tenant mới bắt đầu bằng gói Trial 14 ngày. Quyền sử dụng sau gia hạn phụ thuộc đúng
                vào gói được chọn.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Plan 1: Starter */}
                <label className="relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-5 cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="radio"
                    name="planCode"
                    value="STARTER_99K"
                    className="sr-only peer"
                  />
                  <div className="peer-checked:border-emerald-500 border border-transparent rounded-xl absolute inset-0 pointer-events-none" />
                  <div className="space-y-2">
                    <Badge variant="outline" className="border-slate-700 text-slate-300">
                      STARTER
                    </Badge>
                    <p className="text-2xl font-bold">
                      99.000 ₫ <span className="text-xs font-normal text-slate-400">/tháng</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      Dành cho KOC mới khởi tạo nhóm nhỏ dưới 100 thành viên.
                    </p>
                  </div>
                  <ul className="mt-4 text-xs text-slate-300 space-y-1.5 border-t border-slate-900 pt-3">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-400" /> Tối đa 100 thành viên
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-400" /> Không giới hạn Clicks &
                      Tạo Link AFF
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-400" /> Full Bot Zalo Nhóm Chat
                    </li>
                  </ul>
                </label>

                {/* Plan 2: Pro (Recommended) */}
                <label className="relative flex flex-col justify-between rounded-xl border-2 border-emerald-500 bg-emerald-950/20 p-5 cursor-pointer shadow-lg">
                  <input
                    type="radio"
                    name="planCode"
                    value="PRO_199K"
                    defaultChecked
                    className="sr-only peer"
                  />
                  <div className="peer-checked:ring-2 peer-checked:ring-emerald-400 rounded-xl absolute inset-0 pointer-events-none" />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-emerald-600 text-white">PRO (KHUYÊN DÙNG)</Badge>
                      <Sparkles className="size-4 text-amber-400" />
                    </div>
                    <p className="text-2xl font-bold text-emerald-400">
                      199.000 ₫ <span className="text-xs font-normal text-slate-400">/tháng</span>
                    </p>
                    <p className="text-xs text-slate-300">
                      Gói phổ biến cho cộng đồng săn sale dưới 1.000 thành viên.
                    </p>
                  </div>
                  <ul className="mt-4 text-xs text-slate-200 space-y-1.5 border-t border-emerald-900/50 pt-3">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-400" /> Tối đa 1.000 thành viên
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-400" /> Không giới hạn Clicks &
                      Tạo Link AFF
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-400" /> Shopee, Lazada &
                      AccessTrade
                    </li>
                  </ul>
                </label>

                {/* Plan 3: Business */}
                <label className="relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-5 cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="radio"
                    name="planCode"
                    value="PREMIUM_399K"
                    className="sr-only peer"
                  />
                  <div className="peer-checked:border-emerald-500 border border-transparent rounded-xl absolute inset-0 pointer-events-none" />
                  <div className="space-y-2">
                    <Badge variant="outline" className="border-purple-500/40 text-purple-400">
                      BUSINESS
                    </Badge>
                    <p className="text-2xl font-bold">
                      399.000 ₫ <span className="text-xs font-normal text-slate-400">/tháng</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      Dành cho cộng đồng lớn quy mô đến 10.000 thành viên.
                    </p>
                  </div>
                  <ul className="mt-4 text-xs text-slate-300 space-y-1.5 border-t border-slate-900 pt-3">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-purple-400" /> Tối đa 10.000 thành viên
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-purple-400" /> Không giới hạn Clicks &
                      Tạo Link AFF
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-purple-400" /> Tối đa 500.000 lượt
                      click/tháng
                    </li>
                  </ul>
                </label>
              </div>

              {/* Free Trial Guarantee Callout */}
              <div className="mt-6 rounded-xl bg-slate-950 p-4 border border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Zap className="size-5 text-amber-400 shrink-0" />
                  <p className="text-xs text-slate-300">
                    🎁 Bạn sẽ nhận <strong>14 ngày Dùng Thử Miễn Phí</strong> ngay sau khi bấm Kích
                    hoạt. Hệ thống chỉ yêu cầu thanh toán khi hết hạn dùng thử.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full h-12 bg-emerald-600 font-bold text-white hover:bg-emerald-500 text-base shadow-xl"
          >
            <Building2 className="mr-2 size-5" /> Kích Hoạt Kênh KOC & Bắt Đầu Ngay (Miễn Phí 14
            Ngày)
          </Button>
        </form>
      </div>
    </div>
  );
}

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { registerTenantWithTrial } from "@/lib/tenant";
import { getAppHostDisplay } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Crown, Sparkles, Store, Zap } from "lucide-react";
import { TenantSubmitButton } from "./submit-button";

async function createTenantAction(formData: FormData) {
  "use server";
  const user = await requireUser();
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
  if (existingOwner) redirect(`/shop/${existingOwner.id}/settings` as Route);

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

  redirect("/shop?onboarding=success" as Route);
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
    redirect(`/shop/${existingTenant.id}` as Route);
  }

  return (
    <div className="relative min-h-screen bg-background px-4 py-16 text-foreground flex items-center justify-center overflow-hidden transition-colors">
      {/* Background glow accents */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[40rem] rounded-full bg-emerald-500/10 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 right-10 size-[30rem] rounded-full bg-teal-500/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-4xl space-y-8">
        {/* Title Header */}
        <div className="text-center space-y-3">
          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold rounded-full inline-flex items-center">
            <Sparkles className="mr-1.5 size-4 text-emerald-600 dark:text-emerald-400" /> Khởi Tạo
            Kênh Săn Sale Riêng
          </Badge>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground font-sans">
            Tạo Kênh Affiliate Cho Cộng Đồng
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
            Sở hữu kênh Shopee Affiliate riêng với{" "}
            <strong className="text-emerald-600 dark:text-emerald-400">
              14 ngày dùng thử miễn phí
            </strong>
            .
          </p>
        </div>

        {params.error === "slug_taken" ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm font-medium text-red-600 dark:text-red-400 shadow-lg">
            ⚠️ Đường dẫn Slug URL này đã có người đăng ký. Vui lòng chọn một đường dẫn khác.
          </div>
        ) : null}

        {params.error === "missing_fields" ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-sm font-medium text-amber-600 dark:text-amber-400 shadow-lg">
            ⚠️ Vui lòng điền đầy đủ Tên Kênh KOC và Đường dẫn Slug URL.
          </div>
        ) : null}

        <form action={createTenantAction} className="space-y-8">
          {/* Section 1: Tenant Information */}
          <Card className="border border-border bg-card text-card-foreground shadow-2xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-border/80 bg-muted/40 pb-5">
              <CardTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
                <Store className="size-5 text-emerald-600 dark:text-emerald-400" /> 1. Thiết Lập
                Thông Tin Kênh
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Nhập tên kênh, đường dẫn trực tiếp và màu sắc nhận diện thương hiệu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-foreground font-semibold text-sm">
                    Tên Kênh / Thương hiệu của bạn
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Ví dụ: Săn Sale Cùng Nam, KOC Review..."
                    required
                    className="h-11 border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug" className="text-foreground font-semibold text-sm">
                    Đường dẫn Trực tiếp Kênh KOC
                  </Label>
                  <div className="flex h-11 rounded-xl border border-border bg-background overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                    <span className="bg-muted px-3.5 text-xs text-muted-foreground border-r border-border flex items-center font-mono select-none shrink-0">
                      {getAppHostDisplay()}/
                    </span>
                    <Input
                      id="slug"
                      name="slug"
                      placeholder="sansale-nam"
                      required
                      className="h-full border-0 bg-transparent text-foreground placeholder:text-muted-foreground focus:ring-0 focus-visible:ring-0 rounded-none px-3"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="brandColor" className="text-foreground font-semibold text-sm">
                  Màu sắc nhận diện (Brand Color)
                </Label>
                <div className="flex items-center gap-4 bg-muted/50 p-3 rounded-xl border border-border">
                  <Input
                    id="brandColor"
                    name="brandColor"
                    type="color"
                    defaultValue="#059669"
                    className="size-10 rounded-lg p-0.5 border-border bg-background cursor-pointer shrink-0"
                  />
                  <span className="text-xs text-muted-foreground">
                    Tự chọn màu sắc chủ đạo đại lý hiển thị trên giao diện của bạn.
                  </span>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="shopeeAffiliateId"
                    className="font-semibold text-foreground text-sm"
                  >
                    Shopee Affiliate ID
                  </Label>
                  <Input
                    id="shopeeAffiliateId"
                    name="shopeeAffiliateId"
                    inputMode="numeric"
                    pattern="[0-9]{5,30}"
                    placeholder="Ví dụ: 17330520179"
                    required
                    className="h-11 border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary rounded-xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    Link của thành viên trong nhóm sẽ được tạo bằng Affiliate ID này.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="memberSharePercent"
                    className="font-semibold text-foreground text-sm"
                  >
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
                      className="h-11 border-border bg-background pr-12 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary rounded-xl"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                      %
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hệ thống trừ 10% thuế ước tính trước khi nhân tỷ lệ này.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Subscription Plan Selector */}
          <Card className="border border-border bg-card text-card-foreground shadow-2xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-border/80 bg-muted/40 pb-5">
              <CardTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
                <Crown className="size-5 text-amber-500 dark:text-amber-400" /> 2. Chọn Gói Dịch Vụ
                SaaS KOC (Miễn Phí 14 Ngày Đầu)
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Tenant mới khởi tạo với gói Trial 14 ngày. Hết hạn dùng thử mới tính cước theo gói
                đã chọn.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Plan 1: Starter */}
                <label className="relative flex flex-col justify-between rounded-2xl border border-border bg-background/80 p-5 cursor-pointer hover:border-border/80 transition-all">
                  <input
                    type="radio"
                    name="planCode"
                    value="STARTER_99K"
                    className="sr-only peer"
                  />
                  <div className="peer-checked:border-emerald-500 peer-checked:bg-emerald-500/5 peer-checked:ring-1 peer-checked:ring-emerald-500/50 border border-transparent rounded-2xl absolute inset-0 pointer-events-none transition-all" />
                  <div className="space-y-3">
                    <Badge
                      variant="outline"
                      className="border-border text-foreground font-semibold px-2.5 py-0.5"
                    >
                      STARTER
                    </Badge>
                    <div>
                      <p className="text-2xl font-extrabold text-foreground">
                        99.000 ₫{" "}
                        <span className="text-xs font-normal text-muted-foreground">/tháng</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Dành cho KOC mới khởi tạo nhóm nhỏ dưới 100 thành viên.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-5 text-xs text-muted-foreground space-y-2 border-t border-border pt-4">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />{" "}
                      Tối đa 100 thành viên
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />{" "}
                      Không giới hạn Clicks & Link AFF
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />{" "}
                      Full Bot Zalo Nhóm Chat
                    </li>
                  </ul>
                </label>

                {/* Plan 2: Pro (Recommended) */}
                <label className="relative flex flex-col justify-between rounded-2xl border-2 border-emerald-500 bg-emerald-500/10 p-5 cursor-pointer shadow-xl shadow-emerald-500/10">
                  <input
                    type="radio"
                    name="planCode"
                    value="PRO_199K"
                    defaultChecked
                    className="sr-only peer"
                  />
                  <div className="peer-checked:ring-2 peer-checked:ring-emerald-500 rounded-2xl absolute inset-0 pointer-events-none transition-all" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-emerald-600 text-white font-bold px-2.5 py-0.5">
                        PRO (KHUYÊN DÙNG)
                      </Badge>
                      <Sparkles className="size-4 text-amber-500 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                        199.000 ₫{" "}
                        <span className="text-xs font-normal text-muted-foreground">/tháng</span>
                      </p>
                      <p className="text-xs text-foreground mt-1">
                        Gói phổ biến cho cộng đồng săn sale dưới 1.000 thành viên.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-5 text-xs text-foreground space-y-2 border-t border-emerald-500/20 pt-4">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />{" "}
                      Tối đa 1.000 thành viên
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />{" "}
                      Không giới hạn Clicks & Link AFF
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />{" "}
                      Shopee, Lazada & AccessTrade
                    </li>
                  </ul>
                </label>

                {/* Plan 3: Business */}
                <label className="relative flex flex-col justify-between rounded-2xl border border-border bg-background/80 p-5 cursor-pointer hover:border-border/80 transition-all">
                  <input
                    type="radio"
                    name="planCode"
                    value="PREMIUM_399K"
                    className="sr-only peer"
                  />
                  <div className="peer-checked:border-emerald-500 peer-checked:bg-emerald-500/5 peer-checked:ring-1 peer-checked:ring-emerald-500/50 border border-transparent rounded-2xl absolute inset-0 pointer-events-none transition-all" />
                  <div className="space-y-3">
                    <Badge
                      variant="outline"
                      className="border-purple-500/40 text-purple-600 dark:text-purple-400 font-semibold px-2.5 py-0.5"
                    >
                      BUSINESS
                    </Badge>
                    <div>
                      <p className="text-2xl font-extrabold text-foreground">
                        399.000 ₫{" "}
                        <span className="text-xs font-normal text-muted-foreground">/tháng</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Dành cho cộng đồng lớn quy mô đến 10.000 thành viên.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-5 text-xs text-muted-foreground space-y-2 border-t border-border pt-4">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />{" "}
                      Tối đa 10.000 thành viên
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />{" "}
                      Không giới hạn Clicks & Link AFF
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />{" "}
                      Tối đa 500.000 lượt click/tháng
                    </li>
                  </ul>
                </label>
              </div>

              {/* Free Trial Guarantee Callout */}
              <div className="rounded-2xl bg-muted/60 p-4 border border-border flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Zap className="size-5 text-amber-500 dark:text-amber-400 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    🎁 Bạn sẽ nhận{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      14 ngày Dùng Thử Miễn Phí
                    </strong>{" "}
                    ngay sau khi kích hoạt. Hệ thống chỉ bắt đầu tính phí sau khi hết hạn dùng thử.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <TenantSubmitButton />
        </form>
      </div>
    </div>
  );
}

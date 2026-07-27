import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { registerTenantWithTrial } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, Sparkles, Store } from "lucide-react";

async function createTenantAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  const name = formData.get("name") as string;
  const slug = (formData.get("slug") as string)?.toLowerCase().trim();
  const brandColor = (formData.get("brandColor") as string) || "#173b31";

  if (!name || !slug) {
    redirect("/onboarding/tenant?error=missing_fields");
  }

  // Check unique slug
  const existing = await db.tenant.findUnique({ where: { slug } });
  if (existing) {
    redirect("/onboarding/tenant?error=slug_taken");
  }

  // Create tenant and set user as owner
  const tenant = await registerTenantWithTrial({
    name,
    slug,
    ownerUserId: user.id
  });

  // Update user's tenantId & brand color
  await db.tenant.update({
    where: { id: tenant.id },
    data: { brandColor }
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
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-2">
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <Sparkles className="mr-1 size-3.5" /> Khởi Tạo Kênh KOC / Affiliate Thương Hiệu Riêng
          </Badge>
          <h1 className="display-type text-3xl sm:text-4xl font-bold">Tạo Kênh KOC Nền Tảng.</h1>
          <p className="text-sm text-slate-400">
            Sở hữu thương hiệu Cashback & Affiliate riêng với 14 ngày dùng thử miễn phí đầy đủ tính năng.
          </p>
        </div>

        {params.error === "slug_taken" ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-xs text-red-400">
            ⚠️ Slug URL đường dẫn này đã có người sử dụng. Vui lòng chọn đường dẫn slug khác.
          </div>
        ) : null}

        {params.error === "missing_fields" ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-xs text-amber-400">
            ⚠️ Vui lòng điền đầy đủ Tên Kênh KOC và Đường dẫn Slug URL.
          </div>
        ) : null}

        <Card className="border-slate-800 bg-slate-900 text-white shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Store className="size-5 text-emerald-400" /> Thông tin Kênh KOC
            </CardTitle>
            <CardDescription className="text-slate-400">
              Thiết lập tên gọi, đường dẫn và màu sắc thương hiệu KOC của bạn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createTenantAction} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-200">Tên Kênh KOC / Thương hiệu</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Ví dụ: Săn Sale Cùng Nam, KOC Review Chất..."
                  required
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug" className="text-slate-200">Đường dẫn Slug URL Kênh KOC</Label>
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
                <p className="text-[11px] text-slate-500">
                  Đây là link mua sắm chia sẻ cho thành viên của bạn (VD: affweb.vn/sansale-nam)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="brandColor" className="text-slate-200">Màu sắc chủ đạo (Brand Color)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="brandColor"
                    name="brandColor"
                    type="color"
                    defaultValue="#173b31"
                    className="size-10 rounded-lg p-0.5 border-slate-800 bg-slate-950 cursor-pointer"
                  />
                  <span className="text-xs text-slate-400 font-mono">Tự chọn màu sắc thương hiệu hiển thị</span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950 p-4 space-y-2 border border-slate-800">
                <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" /> Quyền lợi KOC Tenant Owner:
                </p>
                <ul className="text-xs text-slate-300 space-y-1 pl-5 list-disc">
                  <li>Sở hữu Kênh Affiliate & Cashback với giao diện thương hiệu riêng.</li>
                  <li>Xem tổng doanh thu và chia % hoa hồng cho các thành viên trong kênh.</li>
                  <li>Tự động nhận 14 ngày dùng thử miễn phí gói PRO full tính năng.</li>
                </ul>
              </div>

              <Button type="submit" className="w-full bg-emerald-600 font-semibold hover:bg-emerald-500 text-white">
                <Building2 className="mr-2 size-4" /> Kích Hoạt Kênh KOC & Bắt Đầu Ngay
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

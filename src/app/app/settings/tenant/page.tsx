"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Crown,
  Globe,
  KeyRound,
  MessageSquareCode,
  QrCode,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLAN_PRESETS } from "@/lib/tenant-config";

export default function TenantSettingsPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [isYearlyBilling, setIsYearlyBilling] = useState(false);

  const [payosData, setPayosData] = useState<{
    checkoutUrl?: string;
    qrCode?: string;
    amount?: number;
    planCode?: string;
  } | null>(null);

  // Demo tenant state
  const [tenant, setTenant] = useState({
    id: "demo-tenant-id",
    name: "Cộng Đồng Săn Sale KOC",
    slug: "sansale-koc",
    customDomain: "aff.sansale.vn",
    status: "TRIAL",
    isTrial: true,
    trialDaysLeft: 11,
    planId: "TRIAL_14D",
    shopeeAppId: "100238491",
    shopeeSecret: "••••••••••••••••",
    accesstradeToken: "at_tok_9918231920381923",
    zaloOAId: "3892019238401",
    zaloBotToken: "zalo_bot_tok_991823901"
  });

  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savingZalo, setSavingZalo] = useState(false);
  const [zaloSuccess, setZaloSuccess] = useState(false);

  const handleCheckout = async (basePlanCode: string) => {
    const planCode = isYearlyBilling ? `${basePlanCode.replace("_99K", "_YEARLY").replace("_199K", "_YEARLY").replace("_399K", "_YEARLY")}` : basePlanCode;
    setLoadingPlan(planCode);
    setPayosData(null);
    try {
      const res = await fetch("/api/saas/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          planCode
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setPayosData({
          checkoutUrl: data.data.checkoutUrl,
          qrCode: data.data.qrCode,
          amount: PLAN_PRESETS[planCode]?.priceMonthly ?? 0,
          planCode
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleSaveAffiliateConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setTimeout(() => {
      setSavingConfig(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 800);
  };

  const handleSaveZaloConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingZalo(true);
    setTimeout(() => {
      setSavingZalo(false);
      setZaloSuccess(true);
      setTimeout(() => setZaloSuccess(false), 3000);
    }, 800);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-10">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý Không gian làm việc (SaaS Tenant)</h1>
          <p className="text-muted-foreground">
            Cấu hình chìa khóa Affiliate riêng, Zalo Bot tự động và gói cước SaaS.
          </p>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5 px-3 py-1 text-sm border-primary text-primary">
          <Building2 className="size-4" /> Tenant: affweb.vn/{tenant.slug}
        </Badge>
      </div>

      {/* Trial Alert Banner */}
      {tenant.isTrial && (
        <Card className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-amber-500/20">
                <Sparkles className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold">Bạn đang dùng thử miễn phí 14 ngày!</p>
                <p className="text-sm opacity-80">
                  Còn <strong>{tenant.trialDaysLeft} ngày</strong> dùng thử gói Pro đầy đủ tính năng & Zalo Bot. Nâng cấp ngay để tự động gia hạn 24/7 qua PayOS.
                </p>
              </div>
            </div>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-full px-6"
              onClick={() => handleCheckout("PRO_199K")}
            >
              Gia hạn gói Pro (199k/tháng)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Affiliate Commission Ownership Guarantee */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex items-start gap-4 p-5">
          <ShieldCheck className="size-6 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-emerald-900 dark:text-emerald-300">
              Cam kết 100% Hoa hồng thuộc về Bạn
            </p>
            <p className="text-sm text-emerald-800/80 dark:text-emerald-400">
              Mọi khoản hoa hồng phát sinh từ Shopee & AccessTrade sẽ chuyển trực tiếp về tài khoản Affiliate cá nhân của bạn. 
              Chủ hệ thống SaaS chỉ thu phí thuê nền tảng cố định (99k/199k/399k) và <strong>không thu bất kỳ % chiết khấu nào</strong>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* PayOS VietQR Modal / Card if generated */}
      {payosData && (
        <Card className="border-2 border-primary bg-card shadow-xl">
          <CardHeader className="bg-primary/5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="size-6 text-primary" />
                <CardTitle>Thanh toán Gia hạn qua PayOS (VietQR)</CardTitle>
              </div>
              <Badge variant="secondary">Tự động kích hoạt 24/7</Badge>
            </div>
            <CardDescription>
              Quét mã QR bằng ứng dụng ngân hàng bất kỳ để tự động gia hạn gói <strong>{payosData.planCode}</strong> ({payosData.amount?.toLocaleString("vi-VN")} ₫)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-around">
            <div className="text-center space-y-2">
              <div className="inline-block p-3 rounded-2xl bg-white shadow-md border">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payosData.checkoutUrl || "")}`}
                  alt="VietQR PayOS"
                  className="size-48 object-contain"
                />
              </div>
              <p className="text-xs text-muted-foreground">Mã QR VietQR chuẩn Napas247</p>
            </div>
            <div className="space-y-4 max-w-md w-full">
              <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Số tiền thanh toán:</span>
                  <span className="font-bold text-primary text-base">{payosData.amount?.toLocaleString("vi-VN")} ₫</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cổng thanh toán:</span>
                  <span className="font-medium">PayOS VietQR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Thời gian kích hoạt:</span>
                  <span className="font-medium text-emerald-600">Tự động mở khóa ngay</span>
                </div>
              </div>

              {payosData.checkoutUrl && (
                <Button asChild className="w-full rounded-full" size="lg">
                  <a href={payosData.checkoutUrl} target="_blank" rel="noreferrer">
                    Mở trang thanh toán PayOS <CreditCard className="ml-2 size-4" />
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription Pricing Grid & Monthly/Yearly Toggle */}
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Crown className="size-5 text-amber-500" /> Bảng Gói cước SaaS & Gia hạn tự động
          </h2>

          {/* Billing Cycle Switcher */}
          <div className="flex items-center gap-3 bg-muted p-1.5 rounded-full w-fit">
            <button
              type="button"
              onClick={() => setIsYearlyBilling(false)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-full transition ${
                !isYearlyBilling ? "bg-background shadow text-foreground" : "text-muted-foreground"
              }`}
            >
              Thanh toán Hàng tháng
            </button>
            <button
              type="button"
              onClick={() => setIsYearlyBilling(true)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-full transition flex items-center gap-1.5 ${
                isYearlyBilling ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Thanh toán Hàng năm
              <Badge variant="secondary" className="bg-amber-400 text-amber-950 font-bold px-1.5 text-[10px]">
                Tiết kiệm 2 tháng 🔥
              </Badge>
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* 99K STARTER */}
          <Card className="relative flex flex-col justify-between border-border hover:border-primary/50 transition">
            <CardHeader>
              <CardTitle className="text-lg">STARTER</CardTitle>
              <div className="mt-2 text-3xl font-extrabold">
                {isYearlyBilling ? "990.000 ₫" : "99.000 ₫"}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {isYearlyBilling ? "/ năm (~82k/tháng)" : "/ tháng"}
                </span>
              </div>
              <CardDescription>Dành cho KOC cá nhân & nhóm mua sắm nhỏ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm flex-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Tối đa <strong>500 Thành viên</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> 5,000 Clicks/tháng
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Shopee Direct Link / CSV Import
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs">❌ Chưa hỗ trợ Zalo Bot</span>
              </div>
            </CardContent>
            <div className="p-6 pt-0">
              <Button
                variant="outline"
                className="w-full rounded-full"
                disabled={loadingPlan?.startsWith("STARTER")}
                onClick={() => handleCheckout("STARTER_99K")}
              >
                {loadingPlan?.startsWith("STARTER") ? "Đang tạo mã PayOS..." : isYearlyBilling ? "Chọn Gói 990k/Năm" : "Chọn Gói 99k/Tháng"}
              </Button>
            </div>
          </Card>

          {/* 199K PRO (FEATURED) */}
          <Card className="relative flex flex-col justify-between border-2 border-primary shadow-lg bg-primary/5">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-primary text-primary-foreground px-3 py-1 text-xs">
                Phổ biến nhất ✨
              </Badge>
            </div>
            <CardHeader>
              <CardTitle className="text-lg">PRO</CardTitle>
              <div className="mt-2 text-3xl font-extrabold text-primary">
                {isYearlyBilling ? "1.990.000 ₫" : "199.000 ₫"}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {isYearlyBilling ? "/ năm (~165k/tháng)" : "/ tháng"}
                </span>
              </div>
              <CardDescription>Dành cho Fanpage, Group & Cộng đồng săn sale</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm flex-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" /> Tối đa <strong>3,000 Thành viên</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" /> <strong>Shopee + AccessTrade API</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" /> <strong>Hỗ trợ Zalo Bot tự tạo link 🤖</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" /> Hỗ trợ Custom Domain riêng
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" /> 100% Hoa hồng về ví bạn
              </div>
            </CardContent>
            <div className="p-6 pt-0">
              <Button
                className="w-full rounded-full"
                disabled={loadingPlan?.startsWith("PRO")}
                onClick={() => handleCheckout("PRO_199K")}
              >
                {loadingPlan?.startsWith("PRO") ? "Đang tạo mã PayOS..." : isYearlyBilling ? "Gia hạn Pro (1.99tr/Năm)" : "Gia hạn Pro (199k/Tháng)"}
              </Button>
            </div>
          </Card>

          {/* 399K BUSINESS */}
          <Card className="relative flex flex-col justify-between border-border hover:border-primary/50 transition">
            <CardHeader>
              <CardTitle className="text-lg">PREMIUM / BUSINESS</CardTitle>
              <div className="mt-2 text-3xl font-extrabold">
                {isYearlyBilling ? "3.990.000 ₫" : "399.000 ₫"}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {isYearlyBilling ? "/ năm (~332k/tháng)" : "/ tháng"}
                </span>
              </div>
              <CardDescription>Dành cho Doanh nghiệp, Agency & Nền tảng lớn</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm flex-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Tối đa <strong>20,000+ Thành viên</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Full Open API (Shopee, AT, TikTok)
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> <strong>Full Zalo Bot & Broadcast 🤖</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Định tuyến Kênh KOC Multi-Tenant Path (/t/[slug])
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Full White-label & Custom Brand
              </div>
            </CardContent>
            <div className="p-6 pt-0">
              <Button
                variant="outline"
                className="w-full rounded-full"
                disabled={loadingPlan?.startsWith("PREMIUM")}
                onClick={() => handleCheckout("PREMIUM_399K")}
              >
                {loadingPlan?.startsWith("PREMIUM") ? "Đang tạo mã PayOS..." : isYearlyBilling ? "Chọn Business (3.99tr/Năm)" : "Chọn Business (399k/Tháng)"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* 1 Central Zalo Bot System */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareCode className="size-5 text-blue-600" />
              <CardTitle>Mô Hình 1 Bot Zalo Trung Tâm (0 Cấu hình - 1 Click Kích Hoạt)</CardTitle>
            </div>
            <Badge className="bg-blue-600 text-white">PRO & PREMIUM</Badge>
          </div>
          <CardDescription>
            Không cần tự đăng ký Zalo Cloud hay khai báo App rắc rối! Tất cả các Kênh KOC đều dùng chung <strong>1 Con Bot Zalo Trung Tâm duy nhất</strong> của hệ thống.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-background border">
            <div className="text-center space-y-2">
              <div className="inline-block p-3 rounded-2xl bg-white shadow-md border">
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https%3A%2F%2Fzalo.me%2Fbot-master-affweb"
                  alt="1 Master Zalo Bot QR Code"
                  className="size-40 object-contain"
                />
              </div>
              <p className="text-xs text-muted-foreground">Mã QR Bot Zalo Trung Tâm</p>
            </div>

            <div className="space-y-3 flex-1">
              <h3 className="font-semibold text-base text-foreground">📌 2 Bước Kích Hoạt Bot Zalo Cho Nhóm Săn Sale Của Bạn:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Quét mã QR để <strong>Thêm Bot Zalo Trung Tâm vào Nhóm Chat Zalo</strong> của bạn.</li>
                <li>
                  Gõ câu lệnh kích hoạt trực tiếp trong nhóm:{" "}
                  <code className="bg-slate-900 text-emerald-400 px-2 py-0.5 rounded font-mono text-xs">
                    /link {tenant.slug}
                  </code>
                </li>
              </ol>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Badge className="bg-emerald-600 text-white px-3 py-1 text-xs">
                  🟢 Tự động bắt link Shopee & Lazada trong Nhóm
                </Badge>
                <Badge variant="outline" className="text-blue-600 border-blue-600 text-xs">
                  ⚡️ Ghi nhận 100% Hoa hồng & SubID về Kênh: {tenant.slug}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Affiliate Credentials Settings Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <CardTitle>Cấu hình Affiliate Credentials (Shopee & AccessTrade)</CardTitle>
          </div>
          <CardDescription>
            Nhập khóa API cá nhân của bạn để hệ thống tự động gắn SubID và ghi nhận hoa hồng trực tiếp về tài khoản Affiliate của bạn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveAffiliateConfig} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shopeeAppId">Shopee Affiliate App ID</Label>
                <Input
                  id="shopeeAppId"
                  value={tenant.shopeeAppId}
                  onChange={(e) => setTenant({ ...tenant, shopeeAppId: e.target.value })}
                  placeholder="Ví dụ: 10029384"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopeeSecret">Shopee Affiliate Secret Key</Label>
                <Input
                  id="shopeeSecret"
                  type="password"
                  value={tenant.shopeeSecret}
                  onChange={(e) => setTenant({ ...tenant, shopeeSecret: e.target.value })}
                  placeholder="Secret key từ Shopee Open Platform"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accesstradeToken">AccessTrade Access Token / API Key</Label>
              <Input
                id="accesstradeToken"
                type="password"
                value={tenant.accesstradeToken}
                onChange={(e) => setTenant({ ...tenant, accesstradeToken: e.target.value })}
                placeholder="Access token từ AccessTrade Developer Console"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                {saveSuccess && (
                  <>
                    <CheckCircle2 className="size-4" /> Đã lưu cấu hình Affiliate riêng thành công!
                  </>
                )}
              </div>
              <Button type="submit" disabled={savingConfig} className="rounded-full px-6">
                {savingConfig ? "Đang lưu..." : "Lưu cấu hình Affiliate"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

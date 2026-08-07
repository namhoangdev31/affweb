"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  KeyRound,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal
} from "lucide-react";
import { getAppHostDisplay } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TenantProviderCredentials,
  type TenantProviderAccountView
} from "@/components/tenant-provider-credentials";
import {
  updateTenantSettingsAction,
  createZaloBindingCodeAction,
  createSaaSCheckoutSessionAction
} from "@/app/shop/[tenantId]/settings/actions";

type TenantSettingsProps = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isTrial: boolean;
  trialEndsAtLabel: string | null;
  planId: string;
  shopeeAffiliateId: string;
  memberSharePercent: number | null;
};

export function TenantSettingsClient({
  initialTenant,
  zaloAvailable,
  zaloInviteUrl,
  planAllowsCredentials,
  credentialFeatureEnabled,
  providerAccounts
}: {
  initialTenant: TenantSettingsProps;
  zaloAvailable: boolean;
  zaloInviteUrl?: string;
  planAllowsCredentials: boolean;
  credentialFeatureEnabled: boolean;
  providerAccounts: TenantProviderAccountView[];
}) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [isYearlyBilling, setIsYearlyBilling] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [zaloBindingCode, setZaloBindingCode] = useState<string | null>(null);
  const [zaloBindingError, setZaloBindingError] = useState<string | null>(null);
  const [loadingZaloCode, setLoadingZaloCode] = useState(false);

  const [tenant, setTenant] = useState(initialTenant);

  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleCheckout = async (basePlanCode: string) => {
    const planCode = isYearlyBilling
      ? `${basePlanCode.replace("_99K", "_YEARLY").replace("_199K", "_YEARLY").replace("_399K", "_YEARLY")}`
      : basePlanCode;
    setLoadingPlan(planCode);
    try {
      const data = (await createSaaSCheckoutSessionAction({
        tenantId: tenant.id,
        planCode,
        idempotencyKey: crypto.randomUUID()
      })) as { success?: boolean; data?: { checkoutUrl?: string } };
      if (data.success && data.data?.checkoutUrl) {
        window.open(data.data.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      if (err instanceof Error) alert(err.message);
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleSaveAffiliateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setSaveError(null);
    try {
      const body = (await updateTenantSettingsAction({
        shopeeAffiliateId: tenant.shopeeAffiliateId,
        memberSharePercent: tenant.memberSharePercent
      })) as { tenant?: { shopeeAffiliateId: string; memberSharePercent: number } };
      if (!body.tenant) {
        throw new Error("Không thể lưu cấu hình.");
      }
      setTenant((current) => ({ ...current, ...body.tenant }));
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Không thể lưu cấu hình.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleGenerateZaloCode = async () => {
    setLoadingZaloCode(true);
    setZaloBindingError(null);
    try {
      const body = await createZaloBindingCodeAction();
      if (!body.code) {
        throw new Error("Không thể tạo mã liên kết Zalo.");
      }
      setZaloBindingCode(body.code);
    } catch (error) {
      setZaloBindingError(
        error instanceof Error ? error.message : "Không thể tạo mã liên kết Zalo."
      );
    } finally {
      setLoadingZaloCode(false);
    }
  };

  const handleCopyCommand = () => {
    if (!zaloBindingCode) return;
    navigator.clipboard.writeText(`/link ${zaloBindingCode}`);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  useEffect(() => {
    let active = true;
    if (zaloAvailable && !zaloBindingCode && !loadingZaloCode) {
      queueMicrotask(() => {
        if (active) {
          void handleGenerateZaloCode();
        }
      });
    }
    return () => {
      active = false;
    };
  }, [zaloAvailable, zaloBindingCode, loadingZaloCode]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-10">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Quản lý Không gian làm việc (SaaS Tenant)
          </h1>
          <p className="text-muted-foreground">
            Cấu hình Shopee Affiliate ID, Zalo Bot theo entitlement và gói cước SaaS.
          </p>
        </div>
        <Badge
          variant="outline"
          className="w-fit gap-1.5 px-3 py-1 text-sm border-primary text-primary"
        >
          <Building2 className="size-4" /> Tenant: {getAppHostDisplay()}/{tenant.slug}
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
                  Gói dùng thử hết hạn{" "}
                  <strong>{tenant.trialEndsAtLabel ?? "theo chính sách hiện hành"}</strong>. Nâng
                  cấp ngay để tự động gia hạn 24/7 qua PayOS.
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
              Hoa hồng Shopee về tài khoản Affiliate của owner
            </p>
            <p className="text-sm text-emerald-800/80 dark:text-emerald-400">
              Hoa hồng tenant phát sinh từ Shopee được thanh toán vào tài khoản Affiliate của bạn.
              Bạn tự đối soát report và thanh toán phần của member bên ngoài nền tảng; conversion
              tenant không đi qua ví hoặc payout của nền tảng.
            </p>
          </div>
        </CardContent>
      </Card>

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
                isYearlyBilling
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground"
              }`}
            >
              Thanh toán Hàng năm
              <Badge
                variant="secondary"
                className="bg-amber-400 text-amber-950 font-bold px-1.5 text-[10px]"
              >
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
                <CheckCircle2 className="size-4 text-emerald-500" /> Tối đa{" "}
                <strong>100 Thành viên</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" />{" "}
                <strong>Không giới hạn Clicks & Link AFF</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Shopee, Lazada & AccessTrade
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Hỗ trợ Zalo Bot tự tạo link 🤖
              </div>
            </CardContent>
            <div className="p-6 pt-0">
              <Button
                variant="outline"
                className="w-full rounded-full"
                disabled={loadingPlan?.startsWith("STARTER")}
                onClick={() => handleCheckout("STARTER_99K")}
              >
                {loadingPlan?.startsWith("STARTER")
                  ? "Đang tạo mã PayOS..."
                  : isYearlyBilling
                    ? "Chọn Gói 990k/Năm"
                    : "Chọn Gói 99k/Tháng"}
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
                <CheckCircle2 className="size-4 text-primary" /> Tối đa{" "}
                <strong>1,000 Thành viên</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" />{" "}
                <strong>Không giới hạn Clicks & Link AFF</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" /> Shopee, Lazada & AccessTrade
              </div>
              {zaloAvailable ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />{" "}
                  <strong>Hỗ trợ Zalo Bot tự tạo link 🤖</strong>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" /> Owner tự đối soát và chi member
              </div>
            </CardContent>
            <div className="p-6 pt-0">
              <Button
                className="w-full rounded-full"
                disabled={loadingPlan?.startsWith("PRO")}
                onClick={() => handleCheckout("PRO_199K")}
              >
                {loadingPlan?.startsWith("PRO")
                  ? "Đang tạo mã PayOS..."
                  : isYearlyBilling
                    ? "Gia hạn Pro (1.99tr/Năm)"
                    : "Gia hạn Pro (199k/Tháng)"}
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
                <CheckCircle2 className="size-4 text-emerald-500" /> Tối đa{" "}
                <strong>10,000+ Thành viên</strong>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Không giới hạn Clicks & Link
                AFF
              </div>
              {zaloAvailable ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />{" "}
                  <strong>Zalo Bot tạo link Shopee 🤖</strong>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Định tuyến Kênh KOC
                Multi-Tenant Path (/t/[slug])
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" /> Màu sắc và tên thương hiệu
              </div>
            </CardContent>
            <div className="p-6 pt-0">
              <Button
                variant="outline"
                className="w-full rounded-full"
                disabled={loadingPlan?.startsWith("PREMIUM")}
                onClick={() => handleCheckout("PREMIUM_399K")}
              >
                {loadingPlan?.startsWith("PREMIUM")
                  ? "Đang tạo mã PayOS..."
                  : isYearlyBilling
                    ? "Chọn Business (3.99tr/Năm)"
                    : "Chọn Business (399k/Tháng)"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* 1 Central Zalo Bot System */}
      {zaloAvailable && zaloInviteUrl ? (
        <Card className="border-2 border-blue-500/30 bg-gradient-to-br from-blue-950/20 via-background to-teal-950/20 shadow-xl overflow-hidden">
          <CardHeader className="border-b bg-blue-500/5 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-10 place-items-center rounded-xl bg-blue-600/10 text-blue-600 border border-blue-500/20 shadow-sm">
                  <Bot className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">
                    Hướng Dẫn & Kích Hoạt Zalo Bot Tự Động 🤖
                  </CardTitle>
                  <CardDescription className="text-xs">
                    0 Khai báo Cloud — Thêm Bot vào Nhóm Zalo Chat & gõ lệnh 1 Click để bắt đầu hoàn
                    tiền!
                  </CardDescription>
                </div>
              </div>
              <Badge className="bg-blue-600 text-white shadow">PRO & PREMIUM</Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-8 pt-6">
            {/* Step 1 & Step 2 Layout */}
            <div className="grid gap-6 lg:grid-cols-12">
              {/* QR Section - Left 5 cols */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 rounded-2xl bg-card border shadow-sm text-center space-y-4">
                <Badge
                  variant="outline"
                  className="border-blue-500/40 text-blue-600 bg-blue-50/50 dark:bg-blue-950/50 font-semibold px-3 py-1"
                >
                  <QrCode className="mr-1.5 size-3.5" /> BƯỚC 1: QUÉT MÃ QR THÊM BOT
                </Badge>
                {(() => {
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(zaloInviteUrl)}`;
                  return (
                    <>
                      <div className="relative group p-4 rounded-2xl bg-white shadow-md border transition-transform hover:scale-105">
                        {/* QR is generated from the tenant-specific invite URL. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={qrUrl}
                          alt="Mã QR Thêm Bot Zalo Vào Nhóm Chat"
                          className="size-48 object-contain"
                        />
                        <div className="absolute inset-0 bg-blue-900/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
                      </div>
                      <Button
                        asChild
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md"
                      >
                        <a href={zaloInviteUrl} target="_blank" rel="noopener noreferrer">
                          <Smartphone className="mr-2 size-4" /> Mở Zalo Thêm Bot Vào Nhóm
                        </a>
                      </Button>
                    </>
                  );
                })()}
                <p className="text-xs text-muted-foreground">
                  Quét bằng app Zalo trên điện thoại để mời Zalo Bot Trung Tâm vào Group săn sale
                  của bạn.
                </p>
              </div>

              {/* Instruction Steps & Copy Command - Right 7 cols */}
              <div className="lg:col-span-7 space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/50 font-semibold px-3 py-1"
                  >
                    <Terminal className="mr-1.5 size-3.5" /> BƯỚC 2: KÍCH HOẠT VÀO NHÓM
                  </Badge>

                  <h3 className="font-bold text-lg text-foreground">
                    Gõ lệnh kích hoạt trực tiếp trong Nhóm Chat Zalo:
                  </h3>

                  {/* Command Copy Box */}
                  <div className="relative flex items-center justify-between p-4 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 shadow-inner">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-400">Lệnh:</span>
                      <code className="font-mono text-base font-bold text-emerald-400 tracking-wide">
                        {zaloBindingCode ? `/link ${zaloBindingCode}` : "Tạo mã liên kết trước"}
                      </code>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={zaloBindingCode ? handleCopyCommand : handleGenerateZaloCode}
                      disabled={loadingZaloCode}
                      className="text-slate-300 hover:text-white hover:bg-slate-800"
                    >
                      {copiedCommand ? (
                        <>
                          <Check className="mr-1.5 size-4 text-emerald-400" />{" "}
                          <span className="text-emerald-400 font-semibold text-xs">Đã chép!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1.5 size-4" />{" "}
                          <span className="text-xs">Sao chép</span>
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="flex items-start gap-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-600/20 text-blue-600 font-bold text-xs">
                        1
                      </span>
                      Vào nhóm Chat Zalo mà bạn vừa thêm Zalo Bot vào.
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-600/20 text-blue-600 font-bold text-xs">
                        2
                      </span>
                      Dán câu lệnh{" "}
                      <code className="bg-slate-900 text-emerald-400 px-1.5 py-0.5 rounded font-mono text-xs">
                        {zaloBindingCode ? `/link ${zaloBindingCode}` : "/link ZL-..."}
                      </code>{" "}
                      và gửi tin nhắn.
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-600/20 text-blue-600 font-bold text-xs">
                        3
                      </span>
                      Zalo Bot sẽ phản hồi xác nhận kích hoạt thành công cho Kênh{" "}
                      <strong className="text-foreground">{tenant.name}</strong>.
                    </p>
                  </div>
                  {zaloBindingError && (
                    <p className="text-sm text-destructive">{zaloBindingError}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Quick FAQ Checklist */}
            <div className="pt-4 border-t grid gap-4 sm:grid-cols-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-background border">
                <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-foreground">Tự động 100%</p>
                  <p className="text-muted-foreground">
                    Bot chuyển link Shopee thành tracking link cấp tenant, không tạo cashback
                    member.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-background border">
                <ShieldCheck className="size-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-foreground">Binding có kiểm soát</p>
                  <p className="text-muted-foreground">
                    Mỗi group được liên kết bằng mã dùng một lần có thời hạn 10 phút.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-background border">
                <Sparkles className="size-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-foreground">Đối soát bên ngoài</p>
                  <p className="text-muted-foreground">
                    Hoa hồng về Affiliate owner; tenant conversion không đi qua ví nền tảng.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <TenantProviderCredentials
        planAllowsCredentials={planAllowsCredentials}
        credentialFeatureEnabled={credentialFeatureEnabled}
        initialAccounts={providerAccounts}
      />

      {/* Affiliate ID and member cashback settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <CardTitle>Cấu hình Affiliate và mức hoàn cho member</CardTitle>
          </div>
          <CardDescription>
            Link do member trong nhóm tạo sẽ dùng Shopee Affiliate ID của bạn. Hệ thống trừ 10% thuế
            ước tính trước khi áp dụng tỷ lệ hoàn bên dưới.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveAffiliateConfig} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shopeeAffiliateId">Shopee Affiliate ID</Label>
                <Input
                  id="shopeeAffiliateId"
                  inputMode="numeric"
                  pattern="[0-9]{5,30}"
                  value={tenant.shopeeAffiliateId}
                  onChange={(event) =>
                    setTenant({ ...tenant, shopeeAffiliateId: event.target.value })
                  }
                  placeholder="Ví dụ: 17330520179"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Đây là ID trong tài khoản Shopee Affiliate của bạn, không phải ID nền tảng.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberSharePercent">Phần trăm hoàn tiền cho member</Label>
                <div className="relative">
                  <Input
                    id="memberSharePercent"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={tenant.memberSharePercent ?? ""}
                    onChange={(event) =>
                      setTenant({
                        ...tenant,
                        memberSharePercent:
                          event.target.value === "" ? null : Number(event.target.value)
                      })
                    }
                    className="pr-12"
                    placeholder="Ví dụ: 70"
                    required
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ví dụ: hoa hồng 100.000đ → sau thuế còn 90.000đ → tỷ lệ 70% thì member nhận
                  63.000đ.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-sm">
                {saveSuccess && (
                  <span className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="size-4" /> Đã lưu cấu hình Affiliate riêng thành công!
                  </span>
                )}
                {saveError ? <span className="text-destructive">{saveError}</span> : null}
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

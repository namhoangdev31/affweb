import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CircleDollarSign,
  Clock3,
  Link2,
  ReceiptText,
  ShoppingBag,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireUser();
  const [wallet, conversions, clickCount, ownedTenant] = await Promise.all([
    db.walletProjection.findUnique({ where: { userId: user.id } }),
    db.conversion.findMany({
      where: { userId: user.id },
      include: { merchant: { select: { name: true } } },
      orderBy: { purchasedAt: "desc" },
      take: 5
    }),
    db.affiliateClick.count({ where: { userId: user.id } }),
    db.tenant.findFirst({ where: { ownerUserId: user.id } })
  ]);
  const hasTenant = Boolean(ownedTenant);
  const balance = wallet ?? { pendingVnd: 0n, availableVnd: 0n, reservedVnd: 0n, paidVnd: 0n };
  return (
    <div className="space-y-8">
      {/* Onboarding Welcome Gateway for Users Without KOC Channel */}
      {!hasTenant ? (
        <Card className="border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 text-white shadow-2xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Building2 className="size-48 text-emerald-400" />
          </div>
          <CardContent className="p-6 sm:p-8 space-y-6 relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 px-3 py-1">
                <Sparkles className="mr-1.5 size-4 text-emerald-400" /> Dành Cho Người Dùng Mới
              </Badge>
              <Badge variant="outline" className="text-amber-400 border-amber-500/40">
                🎁 Dùng thử Miễn phí 14 Ngày
              </Badge>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Bạn Tham Gia Hệ Thống Với Vai Trò Nào?
              </h2>
              <p className="text-sm text-slate-300 max-w-2xl">
                Nếu bạn có Shopee Affiliate ID riêng, hãy tạo Kênh KOC để thành viên dùng link của
                owner và đối soát thanh toán bên ngoài nền tảng.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-emerald-500/40 bg-emerald-900/30 text-white p-5 space-y-3 hover:border-emerald-400 transition">
                <Building2 className="size-8 text-emerald-400" />
                <h3 className="font-bold text-lg">👑 Khởi Tạo Kênh KOC / Thương Hiệu Riêng</h3>
                <p className="text-xs text-slate-300">
                  Sở hữu Kênh Cashback Shopee với thương hiệu riêng và bắt đầu bằng gói Trial 14
                  ngày.
                </p>
                <Button
                  asChild
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm mt-2"
                >
                  <Link href="/onboarding/tenant">
                    Kích Hoạt Kênh & Chọn Gói <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
              </Card>

              <Card className="border-slate-800 bg-slate-900/80 text-white p-5 space-y-3">
                <ShoppingBag className="size-8 text-amber-400" />
                <h3 className="font-bold text-lg">🛍️ Mua Sắm & Tích Cashback Cá Nhân</h3>
                <p className="text-xs text-slate-300">
                  Dán link Shopee để tạo tracking link và theo dõi cashback cá nhân trong ví nền
                  tảng.
                </p>
                <Button
                  asChild
                  variant="outline"
                  className="w-full border-slate-700 text-slate-200 hover:bg-slate-800 text-sm mt-2"
                >
                  <Link href="/app/links">Tạo Link Tích Hoàn Tiền ngay</Link>
                </Button>
              </Card>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Xin chào, {user.name?.split(" ")[0] ?? "bạn"}
          </p>
          <h1 className="display-type mt-1 text-4xl">Tiền của bạn đang đi đâu?</h1>
        </div>
        <Badge variant="secondary">Beta theo lời mời</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Khả dụng", balance.availableVnd, CircleDollarSign, "Có thể tạo payout"],
          ["Đang chờ", balance.pendingVnd, Clock3, "Chờ đối tác xác minh"],
          ["Đã khóa", balance.reservedVnd, ReceiptText, "Payout đang xử lý"],
          ["Link đã tạo", BigInt(clickCount), Link2, "Tổng số tracking link"]
        ].map(([label, value, Icon, note]) => {
          const StatIcon = Icon as typeof CircleDollarSign;
          return (
            <Card key={String(label)}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{String(label)}</p>
                  <StatIcon className="size-4 text-[#8b6d21]" />
                </div>
                <p className="mt-4 text-2xl font-semibold">
                  {label === "Link đã tạo" ? value?.toString() : formatVnd(value as bigint)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{String(note)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Đơn gần đây</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/app/conversions">
              Xem tất cả <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {conversions.length ? (
            <div className="divide-y">
              {conversions.map((conversion) => (
                <div key={conversion.id} className="flex items-center gap-4 py-4 first:pt-0">
                  <div className="grid size-10 place-items-center rounded-xl bg-secondary font-semibold">
                    {conversion.merchant.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{conversion.merchant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {conversion.purchasedAt.toLocaleDateString("vi-VN")} · {conversion.status}
                    </p>
                  </div>
                  <p className="font-semibold text-primary">{formatVnd(conversion.cashbackVnd)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <ReceiptText className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-4 font-medium">Chưa có đơn được ghi nhận</p>
              <Button asChild className="mt-5">
                <Link href="/app/links">Tạo link đầu tiên</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

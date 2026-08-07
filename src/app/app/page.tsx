import Link from "next/link";
import { ArrowRight, CircleDollarSign, Clock3, Link2, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireUser();
  const [wallet, conversions, clickCount] = await Promise.all([
    db.walletProjection.findUnique({ where: { userId: user.id } }),
    db.conversion.findMany({
      where: { userId: user.id },
      include: { merchant: { select: { name: true } } },
      orderBy: { purchasedAt: "desc" },
      take: 5
    }),
    db.affiliateClick.count({ where: { userId: user.id } })
  ]);
  // OWNER/MASTER_MEMBER only — TENANT_MASTER is redirected at layout
  const balance = wallet ?? { pendingVnd: 0n, availableVnd: 0n, reservedVnd: 0n, paidVnd: 0n };
  return (
    <div className="space-y-8">
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
          ["Khả dụng", balance.availableVnd, CircleDollarSign, "Có thể tạo yêu cầu rút tiền"],
          ["Đang chờ", balance.pendingVnd, Clock3, "Chờ đối tác xác minh"],
          ["Đã khóa", balance.reservedVnd, ReceiptText, "Yêu cầu rút đang xử lý"],
          ["Link đã tạo", BigInt(clickCount), Link2, "Tổng số link giới thiệu"]
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

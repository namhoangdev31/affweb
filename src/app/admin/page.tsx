import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  ShoppingBag
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPasskey } from "@/components/admin-passkey";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

export default async function AdminPage() {
  const [commission, cashback, payout, users, openCases, connectorLag] = await Promise.all([
    db.conversion.aggregate({ _sum: { grossCommissionVnd: true } }),
    db.walletProjection.aggregate({
      _sum: { pendingVnd: true, availableVnd: true, reservedVnd: true }
    }),
    db.payoutTicket.aggregate({ where: { status: "PAID" }, _sum: { amountVnd: true } }),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.reconciliationCase.count({ where: { status: "OPEN" } }),
    db.connectorHealth.count({
      where: { OR: [{ lagSeconds: { gt: 1800 } }, { status: "DEGRADED" }] }
    })
  ]);
  const liability =
    (cashback._sum.pendingVnd ?? 0n) +
    (cashback._sum.availableVnd ?? 0n) +
    (cashback._sum.reservedVnd ?? 0n);
  return (
    <div>
      <p className="text-sm text-muted-foreground">Tổng quan vận hành hệ thống</p>
      <h1 className="display-type mt-1 text-4xl">Dòng tiền hôm nay.</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Tổng hoa hồng nhận", formatVnd(commission._sum.grossCommissionVnd ?? 0n), ArrowUpRight],
          ["Nghĩa vụ cashback", formatVnd(liability), ArrowDownRight],
          ["Đã chi trả rút tiền", formatVnd(payout._sum.amountVnd ?? 0n), CircleDollarSign],
          ["Người dùng hoạt động", String(users), ShoppingBag]
        ].map(([label, value, Icon]) => {
          const ItemIcon = Icon as typeof ArrowUpRight;
          return (
            <Card key={String(label)}>
              <CardContent className="p-5">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{String(label)}</span>
                  <ItemIcon className="size-4" />
                </div>
                <p className="mt-4 text-2xl font-semibold">{String(value)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Đối soát phát sinh</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <AlertTriangle className={openCases ? "text-destructive" : "text-primary"} />
            <div>
              <p className="text-2xl font-semibold">{openCases}</p>
              <p className="text-sm text-muted-foreground">vấn đề cần xử lý</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trạng thái kết nối hệ thống</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <AlertTriangle className={connectorLag ? "text-destructive" : "text-primary"} />
            <div>
              <p className="text-2xl font-semibold">{connectorLag}</p>
              <p className="text-sm text-muted-foreground">
                kết nối tạm gián đoạn hoặc trễ &gt; 30 phút
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <AdminPasskey />
    </div>
  );
}

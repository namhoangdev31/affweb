import { AlertTriangle, Landmark, ReceiptText, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";
import { requireTenantMasterContext } from "@/modules/tenants/persona";

export default async function TenantMasterDashboard() {
  const user = await requireUser();
  const context = await requireTenantMasterContext(user.id);
  const tenantId = context.ownedTenant!.id;
  const [treasury, members, conversions, pending] = await Promise.all([
    db.tenantTreasuryProjection.findUnique({ where: { tenantId } }),
    db.user.count({ where: { tenantId } }),
    db.conversion.count({ where: { tenantId } }),
    db.tenantMemberWalletProjection.aggregate({
      where: { tenantId },
      _sum: { pendingFundingVnd: true }
    })
  ]);
  const cards = [
    {
      label: "Treasury khả dụng",
      value: formatVnd(treasury?.availableVnd ?? 0n),
      icon: Landmark
    },
    {
      label: "Chờ cấp vốn",
      value: formatVnd(pending._sum.pendingFundingVnd ?? 0n),
      icon: AlertTriangle
    },
    { label: "Thành viên", value: members.toLocaleString("vi-VN"), icon: Users },
    { label: "Conversion", value: conversions.toLocaleString("vi-VN"), icon: ReceiptText }
  ];
  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm text-muted-foreground">Tenant master</p>
        <h1 className="text-3xl font-bold tracking-tight">{context.ownedTenant!.name}</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-2xl font-bold">{value}</CardContent>
          </Card>
        ))}
      </div>
      {!context.ownedTenant!.financeEnabled ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex gap-3 pt-6 text-sm text-amber-900">
            <AlertTriangle className="size-5 shrink-0" />
            Tài chính tenant đang khóa. Owner hệ thống phải bật cả env, global flag và flag tenant
            trước khi phát sinh ledger hoặc payout.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

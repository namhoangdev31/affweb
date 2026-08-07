import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";
import { requireTenantUserContext } from "@/modules/tenants/persona";

export default async function TenantUserDashboard({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const context = await requireTenantUserContext(user.id, slug);
  const tenantId = context.memberTenant!.id;
  const [wallet, conversions, clicks] = await Promise.all([
    db.tenantMemberWalletProjection.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } }
    }),
    db.conversion.count({ where: { tenantId, userId: user.id } }),
    db.affiliateClick.count({ where: { tenantId, userId: user.id } })
  ]);
  const cards = [
    ["Chờ Kênh cấp vốn", wallet?.pendingFundingVnd ?? 0n],
    ["Khả dụng", wallet?.availableVnd ?? 0n],
    ["Đang rút", wallet?.reservedVnd ?? 0n],
    ["Đã nhận", wallet?.paidVnd ?? 0n]
  ] as const;
  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm text-muted-foreground">Kênh {context.memberTenant!.name}</p>
        <h1 className="text-3xl font-bold tracking-tight">Cashback của bạn</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{formatVnd(value)}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-wrap gap-6 pt-6 text-sm">
          <span>{clicks.toLocaleString("vi-VN")} link đã tạo</span>
          <span>{conversions.toLocaleString("vi-VN")} đơn hoàn tiền</span>
          <span>Số dư khả dụng sẵn sàng được chuyển khoản theo chính sách Kênh.</span>
        </CardContent>
      </Card>
    </div>
  );
}

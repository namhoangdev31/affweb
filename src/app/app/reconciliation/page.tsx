import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

export default async function ReconciliationPage() {
  const user = await requireUser();
  const [tenant, conversions] = await Promise.all([
    db.tenant.findUnique({
      where: { ownerUserId: user.id },
      include: {
        conversionImports: {
          orderBy: { createdAt: "desc" },
          take: 20
        },
        providerAccounts: {
          include: {
            settlementBatches: {
              orderBy: { createdAt: "desc" },
              take: 20
            }
          }
        }
      }
    }),
    db.conversion.findMany({
      where: { userId: user.id },
      orderBy: { purchasedAt: "desc" },
      take: 50,
      select: {
        id: true,
        platform: true,
        settlementStatus: true,
        netCommissionVnd: true,
        cashbackVnd: true,
        purchasedAt: true
      }
    })
  ]);
  const batches =
    tenant?.providerAccounts.flatMap((account) =>
      account.settlementBatches.map((batch) => ({
        ...batch,
        accountLabel: account.label
      }))
    ) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Orders xác nhận conversion; chỉ Hóa đơn đối soát/Finance evidence mới xác nhận settlement
        </p>
        <h1 className="display-type mt-1 text-4xl">Hóa đơn đối soát.</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nguyên tắc authority</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>“Đã đóng” là kết thúc đối soát, không phải xác nhận tiền đã vào ngân hàng.</p>
          <p>
            Shopee chỉ release khi file chi tiết tie-out line-level; trang tổng hợp, ảnh chụp và
            Payment History không đủ authority.
          </p>
        </CardContent>
      </Card>

      {tenant ? (
        <Card>
          <CardHeader>
            <CardTitle>Import Shopee Orders của tenant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tenant.conversionImports.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có import.</p>
            ) : (
              tenant.conversionImports.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
                >
                  <Badge variant="outline">{item.status}</Badge>
                  <p className="text-sm">
                    {item.acceptedRows} accepted · {item.duplicateRows} duplicate ·{" "}
                    {item.quarantinedRows} quarantine
                  </p>
                  <p className="ml-auto text-xs text-muted-foreground">
                    {item.createdAt.toLocaleString("vi-VN")}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {batches.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Settlement batches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
              >
                <Badge>{batch.status}</Badge>
                <p className="text-sm">{batch.accountLabel}</p>
                <p className="font-medium">{formatVnd(batch.totalAmountVnd)}</p>
                <p className="ml-auto text-xs text-muted-foreground">
                  {batch.createdAt.toLocaleString("vi-VN")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Conversion settlement gần đây</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {conversions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có conversion.</p>
          ) : (
            conversions.map((conversion) => (
              <div
                key={conversion.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
              >
                <Badge variant="outline">{conversion.settlementStatus}</Badge>
                <p className="text-sm">{conversion.platform.replaceAll("_", " ")}</p>
                <p className="font-medium">{formatVnd(conversion.cashbackVnd)}</p>
                <p className="ml-auto text-xs text-muted-foreground">
                  {conversion.purchasedAt.toLocaleString("vi-VN")}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

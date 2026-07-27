import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";
import Link from "next/link";
import { Building2, ShoppingBag, UserCheck } from "lucide-react";

export default async function ConversionsPage({
  searchParams
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = params.scope === "all" ? "all" : "mine";

  // Check if current user is a Tenant Owner (KOC)
  const ownedTenant = await db.tenant.findFirst({
    where: { ownerUserId: user.id }
  });

  // Query filter based on user role and selected scope tab
  const isTenantOwnerView = Boolean(ownedTenant && scope === "all");
  const whereClause = isTenantOwnerView
    ? { tenantId: ownedTenant!.id }
    : { userId: user.id };

  const conversions = await db.conversion.findMany({
    where: whereClause,
    include: {
      merchant: true,
      items: true,
      user: { select: { name: true, email: true } },
      tenant: { select: { name: true, slug: true } }
    },
    orderBy: { purchasedAt: "desc" },
    take: 100
  });

  // Calculate stats if user is a Tenant Owner
  let totalTenantGrossVnd = 0n;
  let totalTenantUserCashbackVnd = 0n;
  let totalTenantOwnerProfitVnd = 0n;

  if (ownedTenant) {
    const allTenantConversions = await db.conversion.findMany({
      where: { tenantId: ownedTenant.id },
      select: { grossCommissionVnd: true, cashbackVnd: true, status: true }
    });

    for (const c of allTenantConversions) {
      if (c.status === "VALIDATED" || c.status === "AVAILABLE") {
        totalTenantGrossVnd += c.grossCommissionVnd;
        totalTenantUserCashbackVnd += c.cashbackVnd;
      }
    }
    // Platform fee 15% (1500 bps), Tenant Owner profit ~35%
    const platformFeeVnd = (totalTenantGrossVnd * 1500n) / 10000n;
    totalTenantOwnerProfitVnd = totalTenantGrossVnd - totalTenantUserCashbackVnd - platformFeeVnd;
    if (totalTenantOwnerProfitVnd < 0n) totalTenantOwnerProfitVnd = 0n;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Dữ liệu đối tác & phân quyền KOC</p>
        <h1 className="display-type mt-1 text-4xl">Đơn hàng & cashback.</h1>
      </div>

      {/* Tenant Owner KPI Metrics Banner */}
      {ownedTenant ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-emerald-950 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-normal text-emerald-200/70">
                Tổng hoa hồng Kênh KOC ({ownedTenant.name})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-100">{formatVnd(totalTenantGrossVnd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-normal text-muted-foreground">
                Lợi nhuận KOC Owner (Ước tính)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">{formatVnd(totalTenantOwnerProfitVnd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-normal text-muted-foreground">
                Tổng Cashback trả cho Thành viên
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatVnd(totalTenantUserCashbackVnd)}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Filter Tabs for Tenant Owner */}
      {ownedTenant ? (
        <div className="flex border-b border-border">
          <Link
            href="/app/conversions?scope=mine"
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              scope === "mine"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserCheck className="size-4" /> Đơn hàng cá nhân của tôi
          </Link>
          <Link
            href="/app/conversions?scope=all"
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              scope === "all"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="size-4" /> Toàn bộ đơn trong Kênh KOC ({ownedTenant.name})
          </Link>
        </div>
      ) : null}

      {/* Conversion List */}
      <div className="space-y-4">
        {conversions.map((conversion) => {
          const isUserOwnOrder = conversion.userId === user.id;
          return (
            <Card key={conversion.id}>
              <CardContent className="flex flex-wrap items-center gap-4 p-5">
                <div className="grid size-11 place-items-center rounded-xl bg-secondary font-semibold">
                  {conversion.merchant.name.charAt(0)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{conversion.merchant.name}</p>
                    <Badge variant={conversion.status === "VALIDATED" || conversion.status === "AVAILABLE" ? "default" : "secondary"}>
                      {conversion.status}
                    </Badge>
                    {isTenantOwnerView ? (
                      <Badge variant="outline" className="text-xs">
                        <ShoppingBag className="mr-1 size-3" />
                        {conversion.user?.name || conversion.user?.email || "Khách mua"}
                      </Badge>
                    ) : null}
                    {conversion.tenant ? (
                      <Badge variant="outline" className="border-emerald-600/30 text-xs text-emerald-700">
                        Kênh: {conversion.tenant.name}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mã đơn: <span className="font-mono">{conversion.externalOrderId}</span> ·{" "}
                    {conversion.purchasedAt.toLocaleString("vi-VN")} ·{" "}
                    {conversion.platform.replaceAll("_", " ")}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-semibold">{formatVnd(conversion.cashbackVnd)}</p>
                  <p className="text-xs text-muted-foreground">
                    {isTenantOwnerView
                      ? `Tổng sàn trả: ${formatVnd(conversion.grossCommissionVnd)}`
                      : `${conversion.shareBps / 100}% hoa hồng chia lại`}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {!conversions.length ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            {isTenantOwnerView
              ? "Chưa có đơn hàng nào phát sinh trong Kênh KOC của bạn."
              : "Bạn chưa có đơn hàng cashback nào."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationNav } from "@/components/pagination-nav";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { paginationPage } from "@/lib/pagination";
import { formatVnd } from "@/lib/utils";
import Link from "next/link";
import { Building2, UserCheck } from "lucide-react";
import { markTenantConversionPaidAction } from "./actions";

const PAGE_SIZE = 20;

export default async function ConversionsPage({
  searchParams
}: {
  searchParams: Promise<{ scope?: string; page?: string }>;
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
  const whereClause = isTenantOwnerView ? { tenantId: ownedTenant!.id } : { userId: user.id };

  const totalConversions = await db.conversion.count({ where: whereClause });
  const currentPage = paginationPage(params.page, totalConversions, PAGE_SIZE);

  const conversions = await db.conversion.findMany({
    where: whereClause,
    include: {
      merchant: true,
      items: true,
      user: { select: { name: true, email: true } },
      tenant: { select: { name: true, slug: true } },
      click: { select: { attributionMode: true } },
      externalIdentities: { select: { externalOrderId: true }, take: 1 }
    },
    orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });

  // Calculate stats if user is a Tenant Owner
  let totalTenantNetVnd = 0n;
  let totalTenantTaxVnd = 0n;
  let totalTenantUserCashbackVnd = 0n;
  let totalTenantOwnerProfitVnd = 0n;

  if (ownedTenant) {
    const allTenantConversions = await db.conversion.findMany({
      where: { tenantId: ownedTenant.id },
      select: {
        netCommissionVnd: true,
        withholdingTaxVnd: true,
        cashbackVnd: true,
        status: true
      }
    });

    for (const c of allTenantConversions) {
      if (c.status === "VALIDATED") {
        totalTenantNetVnd += c.netCommissionVnd;
        totalTenantTaxVnd += c.withholdingTaxVnd;
        totalTenantUserCashbackVnd += c.cashbackVnd;
      }
    }
    totalTenantOwnerProfitVnd = totalTenantNetVnd - totalTenantTaxVnd - totalTenantUserCashbackVnd;
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-emerald-950 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-normal text-emerald-200/70">
                Hoa hồng Shopee ghi nhận ({ownedTenant.name})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-100">{formatVnd(totalTenantNetVnd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-normal text-muted-foreground">
                Thuế ước tính 10%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">{formatVnd(totalTenantTaxVnd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-normal text-muted-foreground">
                Phần admin giữ lại
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">
                {formatVnd(totalTenantOwnerProfitVnd)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-normal text-muted-foreground">
                Cashback cần trả member
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

      {/* Conversion table */}
      {conversions.length ? (
        <div className="space-y-4">
          <Card className="hidden overflow-hidden py-0 md:block">
            <Table className="min-w-[1080px]">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-5">Đơn hàng</TableHead>
                  <TableHead>Đối tác</TableHead>
                  <TableHead>Người mua / Kênh</TableHead>
                  <TableHead>Ngày mua</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Cashback</TableHead>
                  <TableHead>Chi trả member</TableHead>
                  {isTenantOwnerView ? (
                    <TableHead className="pr-5 text-right">Thao tác</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversions.map((conversion) => {
                  const isTenantConversion = Boolean(conversion.tenantId);
                  const isTenantChannel = conversion.click?.attributionMode === "TENANT_CHANNEL";
                  const canMarkPaid =
                    isTenantOwnerView &&
                    conversion.status === "VALIDATED" &&
                    !conversion.tenantPaidAt &&
                    conversion.cashbackVnd > 0n &&
                    !isTenantChannel;

                  return (
                    <TableRow key={conversion.id}>
                      <TableCell className="max-w-56 pl-5 font-mono text-xs whitespace-normal">
                        {conversion.externalIdentities[0]?.externalOrderId ?? conversion.id}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{conversion.merchant.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {conversion.platform.replaceAll("_", " ")}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-52 whitespace-normal">
                        <p>{conversion.user?.name || conversion.user?.email || "Khách mua"}</p>
                        {conversion.tenant ? (
                          <p className="text-xs text-emerald-700">Kênh: {conversion.tenant.name}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Cá nhân</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {conversion.purchasedAt.toLocaleDateString("vi-VN")}
                        <p className="text-xs text-muted-foreground">
                          {conversion.purchasedAt.toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={conversion.status === "VALIDATED" ? "default" : "secondary"}
                        >
                          {conversion.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <p className="font-semibold tabular-nums">
                          {formatVnd(conversion.cashbackVnd)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isTenantOwnerView
                            ? `Sau thuế: ${formatVnd(
                                conversion.netCommissionVnd - conversion.withholdingTaxVnd
                              )}`
                            : isTenantChannel
                              ? "Cashback member bằng 0"
                              : `${conversion.shareBps / 100}% chia lại`}
                        </p>
                      </TableCell>
                      <TableCell>
                        {isTenantConversion && conversion.status === "VALIDATED" ? (
                          <Badge
                            variant={conversion.tenantPaidAt ? "default" : "secondary"}
                            className={
                              isTenantChannel
                                ? "border-blue-500/30 bg-blue-50 text-blue-800"
                                : conversion.tenantPaidAt
                                  ? "bg-emerald-600 text-white"
                                  : "bg-amber-100 text-amber-800"
                            }
                          >
                            {isTenantChannel
                              ? "Không cần chi"
                              : conversion.tenantPaidAt
                                ? "Đã chi trả"
                                : "Chờ chi trả"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {conversion.tenantPaidAt ? (
                          <p className="mt-1 text-xs text-emerald-600">
                            {conversion.tenantPaidAt.toLocaleString("vi-VN")}
                          </p>
                        ) : null}
                      </TableCell>
                      {isTenantOwnerView ? (
                        <TableCell className="pr-5 text-right">
                          {canMarkPaid ? (
                            <form action={markTenantConversionPaidAction}>
                              <input type="hidden" name="conversionId" value={conversion.id} />
                              <Button type="submit" size="sm" className="rounded-full">
                                Đánh dấu đã chi trả
                              </Button>
                            </form>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-3 md:hidden">
            {conversions.map((conversion) => {
              const isTenantChannel = conversion.click?.attributionMode === "TENANT_CHANNEL";
              const canMarkPaid =
                isTenantOwnerView &&
                conversion.status === "VALIDATED" &&
                !conversion.tenantPaidAt &&
                conversion.cashbackVnd > 0n &&
                !isTenantChannel;
              return (
                <Card key={conversion.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{conversion.merchant.name}</p>
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                          {conversion.externalIdentities[0]?.externalOrderId ?? conversion.id}
                        </p>
                      </div>
                      <Badge variant={conversion.status === "VALIDATED" ? "default" : "secondary"}>
                        {conversion.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Ngày mua</p>
                        <p>{conversion.purchasedAt.toLocaleString("vi-VN")}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Cashback</p>
                        <p className="font-semibold">{formatVnd(conversion.cashbackVnd)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {conversion.user?.name || conversion.user?.email || "Khách mua"}
                      {conversion.tenant ? ` · Kênh ${conversion.tenant.name}` : " · Cá nhân"}
                    </p>
                    {canMarkPaid ? (
                      <form action={markTenantConversionPaidAction}>
                        <input type="hidden" name="conversionId" value={conversion.id} />
                        <Button type="submit" size="sm" className="w-full rounded-full">
                          Đánh dấu đã chi trả
                        </Button>
                      </form>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <PaginationNav
            currentPage={currentPage}
            totalItems={totalConversions}
            pageSize={PAGE_SIZE}
            pathname="/app/conversions"
            query={{ scope }}
            itemLabel="đơn hàng"
          />
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          {isTenantOwnerView
            ? "Chưa có đơn hàng nào phát sinh trong Kênh KOC của bạn."
            : "Bạn chưa có đơn hàng cashback nào."}
        </p>
      )}
    </div>
  );
}

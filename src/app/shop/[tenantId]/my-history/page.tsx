import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { requireTenantMasterContext } from "@/modules/tenants/persona";

const PAGE_SIZE = 20;

export default async function ShopMyHistoryPage({
  params,
  searchParams
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { tenantId: paramId } = await params;
  const user = await requireUser();
  const tenantObj = await db.tenant.findFirst({
    where: { OR: [{ id: paramId }, { slug: paramId.toLowerCase() }] }
  });
  const context = await requireTenantMasterContext(user.id, tenantObj?.id);
  const tenant = context.ownedTenant!;

  const searchP = await searchParams;
  const whereClause = { userId: user.id, tenantId: tenant.id };
  const totalConversions = await db.conversion.count({ where: whereClause });
  const currentPage = paginationPage(searchP.page, totalConversions, PAGE_SIZE);

  const conversions = await db.conversion.findMany({
    where: whereClause,
    include: {
      merchant: { select: { name: true, platform: true } },
      externalIdentities: { select: { externalOrderId: true }, take: 1 }
    },
    orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Đơn hàng cá nhân của bạn trong kênh{" "}
          <strong className="text-foreground">/{tenant.slug}</strong>
        </p>
        <h1 className="display-type mt-1 text-4xl">Lịch sử đơn hàng.</h1>
      </div>

      {conversions.length ? (
        <div className="space-y-4">
          <Card className="hidden overflow-hidden py-0 md:block">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-5">Đơn hàng</TableHead>
                  <TableHead>Đối tác</TableHead>
                  <TableHead>Ngày mua</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="pr-5 text-right">Cashback</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversions.map((conversion) => (
                  <TableRow key={conversion.id}>
                    <TableCell className="max-w-56 pl-5 font-mono text-xs whitespace-normal">
                      {conversion.externalIdentities[0]?.externalOrderId ?? conversion.id}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{conversion.merchant.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {conversion.merchant.platform.replaceAll("_", " ")}
                      </p>
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
                      <Badge variant={conversion.status === "VALIDATED" ? "default" : "secondary"}>
                        {conversion.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <p className="font-semibold tabular-nums">
                        {formatVnd(conversion.cashbackVnd)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {`${conversion.shareBps / 100}% hoàn tiền`}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-3 md:hidden">
            {conversions.map((conversion) => (
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
                </CardContent>
              </Card>
            ))}
          </div>

          <PaginationNav
            currentPage={currentPage}
            totalItems={totalConversions}
            pageSize={PAGE_SIZE}
            pathname={`/shop/${tenant.id}/my-history`}
            itemLabel="đơn hàng"
          />
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          Bạn chưa có đơn hàng cashback cá nhân nào trong kênh này.
        </p>
      )}
    </div>
  );
}

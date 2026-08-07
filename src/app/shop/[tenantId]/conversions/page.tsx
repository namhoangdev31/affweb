import { Badge } from "@/components/ui/badge";
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
import { requireTenantMasterContext } from "@/modules/tenants/persona";

const PAGE_SIZE = 20;

export default async function ShopTenantConversionsPage({
  params,
  searchParams
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { tenantId: paramId } = await params;
  const user = await requireUser();
  const query = await searchParams;
  const tenant = await db.tenant.findFirst({
    where: { OR: [{ id: paramId }, { slug: paramId.toLowerCase() }] }
  });
  const context = await requireTenantMasterContext(user.id, tenant?.id);
  const where = { tenantId: context.ownedTenant!.id };
  const total = await db.tenantCashbackObligation.count({ where });
  const currentPage = paginationPage(query.page, total, PAGE_SIZE);
  const obligations = await db.tenantCashbackObligation.findMany({
    where,
    include: {
      user: { select: { name: true, email: true } },
      conversion: {
        select: { platform: true, purchasedAt: true, status: true, rawOrderStatus: true }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Đơn và nghĩa vụ cashback</h1>
        <p className="text-muted-foreground">
          Tự động phân bổ quỹ hoàn tiền theo thứ tự thời gian phát sinh đơn hàng.
        </p>
      </div>
      <Card className="hidden overflow-hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thành viên</TableHead>
              <TableHead>Đơn hàng</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Cần hoàn tiền</TableHead>
              <TableHead className="text-right">Đã cấp vốn</TableHead>
              <TableHead className="text-right">Cần thu hồi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {obligations.map((obligation) => (
              <TableRow key={obligation.id}>
                <TableCell>
                  {obligation.user.name ?? obligation.user.email ?? "Thành viên"}
                </TableCell>
                <TableCell>
                  <p>{obligation.conversion.platform}</p>
                  <p className="text-xs text-muted-foreground">
                    {obligation.conversion.purchasedAt.toLocaleString("vi-VN")}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge>{obligation.status}</Badge>
                </TableCell>
                <TableCell className="text-right">{formatVnd(obligation.amountVnd)}</TableCell>
                <TableCell className="text-right">{formatVnd(obligation.fundedVnd)}</TableCell>
                <TableCell className="text-right">
                  {formatVnd(obligation.recoveryRequiredVnd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="grid gap-4 md:hidden">
        {obligations.map((obligation) => (
          <Card key={obligation.id}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  {obligation.user.name ?? obligation.user.email ?? "Thành viên"}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {obligation.conversion.platform} ·{" "}
                  {obligation.conversion.purchasedAt.toLocaleString("vi-VN")}
                </p>
              </div>
              <Badge>{obligation.status}</Badge>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
              <span>Cần hoàn tiền: {formatVnd(obligation.amountVnd)}</span>
              <span>Đã cấp vốn: {formatVnd(obligation.fundedVnd)}</span>
              <span>Cần thu hồi: {formatVnd(obligation.recoveryRequiredVnd)}</span>
            </CardContent>
          </Card>
        ))}
        {!obligations.length ? (
          <p className="text-muted-foreground">Chưa có dữ liệu hoàn tiền.</p>
        ) : null}
      </div>
      <PaginationNav
        currentPage={currentPage}
        totalItems={total}
        pageSize={PAGE_SIZE}
        pathname={`/shop/${context.ownedTenant!.id}/conversions`}
        itemLabel="nghĩa vụ"
      />
    </div>
  );
}

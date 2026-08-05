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
import { requireTenantUserContext } from "@/modules/tenants/persona";

const PAGE_SIZE = 20;

export default async function TenantUserConversionsPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const query = await searchParams;
  const context = await requireTenantUserContext(user.id, slug);
  const where = { tenantId: context.memberTenant!.id, userId: user.id };
  const total = await db.conversion.count({ where });
  const currentPage = paginationPage(query.page, total, PAGE_SIZE);
  const conversions = await db.conversion.findMany({
    where,
    include: { tenantCashbackObligation: true, externalIdentities: { take: 1 } },
    orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Đơn hàng tenant</h1>
        <p className="text-muted-foreground">
          Chỉ hiển thị conversion thuộc kênh {context.memberTenant!.name}.
        </p>
      </div>
      <Card className="hidden overflow-hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Đơn hàng</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Cashback</TableHead>
              <TableHead className="text-right">Đã cấp vốn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversions.map((conversion) => (
              <TableRow key={conversion.id}>
                <TableCell className="font-mono text-xs">
                  {conversion.externalIdentities[0]?.externalOrderId ?? conversion.id}
                </TableCell>
                <TableCell>{conversion.purchasedAt.toLocaleString("vi-VN")}</TableCell>
                <TableCell>
                  <Badge>{conversion.tenantCashbackObligation?.status ?? conversion.status}</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {conversion.rawOrderStatus ?? conversion.orderValidationStatus}
                  </p>
                </TableCell>
                <TableCell className="text-right">{formatVnd(conversion.cashbackVnd)}</TableCell>
                <TableCell className="text-right">
                  {formatVnd(conversion.tenantCashbackObligation?.fundedVnd ?? 0n)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="grid gap-4 md:hidden">
        {conversions.map((conversion) => (
          <Card key={conversion.id}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  {conversion.externalIdentities[0]?.externalOrderId ?? conversion.id}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {conversion.purchasedAt.toLocaleString("vi-VN")}
                </p>
              </div>
              <Badge>{conversion.tenantCashbackObligation?.status ?? conversion.status}</Badge>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
              <span>Cashback: {formatVnd(conversion.cashbackVnd)}</span>
              <span>
                Đã cấp vốn: {formatVnd(conversion.tenantCashbackObligation?.fundedVnd ?? 0n)}
              </span>
              <span>
                Trạng thái đơn: {conversion.rawOrderStatus ?? conversion.orderValidationStatus}
              </span>
            </CardContent>
          </Card>
        ))}
        {!conversions.length ? <p className="text-muted-foreground">Chưa có conversion.</p> : null}
      </div>
      <PaginationNav
        currentPage={currentPage}
        totalItems={total}
        pageSize={PAGE_SIZE}
        pathname={`/${slug}/app/conversions`}
        itemLabel="đơn hàng"
      />
    </div>
  );
}

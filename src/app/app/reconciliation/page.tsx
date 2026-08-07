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

const PAGE_SIZE = 20;
const PANEL_PAGE_SIZE = 10;

export default async function ReconciliationPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; importPage?: string; batchPage?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const tenant = await db.tenant.findUnique({
    where: { ownerUserId: user.id, kind: "MASTER" },
    select: { id: true }
  });
  const [totalConversions, totalImports, totalBatches] = await Promise.all([
    db.conversion.count({ where: { userId: user.id } }),
    tenant ? db.tenantConversionImport.count({ where: { tenantId: tenant.id } }) : 0,
    tenant ? db.settlementBatch.count({ where: { affiliateAccount: { tenantId: tenant.id } } }) : 0
  ]);
  const currentPage = paginationPage(params.page, totalConversions, PAGE_SIZE);
  const importPage = paginationPage(params.importPage, totalImports, PANEL_PAGE_SIZE);
  const batchPage = paginationPage(params.batchPage, totalBatches, PANEL_PAGE_SIZE);
  const [conversions, imports, batches] = await Promise.all([
    db.conversion.findMany({
      where: { userId: user.id },
      orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        platform: true,
        settlementStatus: true,
        netCommissionVnd: true,
        cashbackVnd: true,
        purchasedAt: true
      }
    }),
    tenant
      ? db.tenantConversionImport.findMany({
          where: { tenantId: tenant.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (importPage - 1) * PANEL_PAGE_SIZE,
          take: PANEL_PAGE_SIZE
        })
      : [],
    tenant
      ? db.settlementBatch.findMany({
          where: { affiliateAccount: { tenantId: tenant.id } },
          include: { affiliateAccount: { select: { label: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (batchPage - 1) * PANEL_PAGE_SIZE,
          take: PANEL_PAGE_SIZE
        })
      : []
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Xác nhận đơn hàng & dữ liệu thanh toán đối soát từ hệ thống
        </p>
        <h1 className="display-type mt-1 text-4xl">Hóa đơn đối soát.</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quy định đối soát</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>“Đã đóng” là kết thúc đối soát, không phải xác nhận tiền đã vào ngân hàng.</p>
          <p>
            Shopee chỉ phát hành khi file chi tiết đối soát khớp khớp dòng đơn; các ảnh chụp không
            có hiệu lực xác nhận.
          </p>
        </CardContent>
      </Card>

      {tenant ? (
        <Card>
          <CardHeader>
            <CardTitle>Lịch sử nhập danh sách đơn Shopee của Kênh</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {imports.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu nhập.</p>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Hợp lệ</TableHead>
                        <TableHead className="text-right">Trùng lặp</TableHead>
                        <TableHead className="text-right">Cần xem xét</TableHead>
                        <TableHead className="text-right">Thời gian</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {imports.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Badge variant="outline">{item.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{item.acceptedRows}</TableCell>
                          <TableCell className="text-right">{item.duplicateRows}</TableCell>
                          <TableCell className="text-right">{item.quarantinedRows}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.createdAt.toLocaleString("vi-VN")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden">
                  {imports.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
                    >
                      <Badge variant="outline">{item.status}</Badge>
                      <p className="text-sm">
                        {item.acceptedRows} hợp lệ · {item.duplicateRows} trùng ·{" "}
                        {item.quarantinedRows} xem xét
                      </p>
                      <p className="ml-auto text-xs text-muted-foreground">
                        {item.createdAt.toLocaleString("vi-VN")}
                      </p>
                    </div>
                  ))}
                </div>
                <PaginationNav
                  currentPage={importPage}
                  totalItems={totalImports}
                  pageSize={PANEL_PAGE_SIZE}
                  pathname="/app/reconciliation"
                  query={{ page: params.page, batchPage: params.batchPage }}
                  pageParam="importPage"
                  itemLabel="dữ liệu nhập"
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {batches.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Đợt thanh toán đối soát</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Tài khoản</TableHead>
                    <TableHead className="text-right">Tổng tiền</TableHead>
                    <TableHead className="text-right">Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <Badge>{batch.status}</Badge>
                      </TableCell>
                      <TableCell>{batch.affiliateAccount.label}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatVnd(batch.totalAmountVnd)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {batch.createdAt.toLocaleString("vi-VN")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
                >
                  <Badge>{batch.status}</Badge>
                  <p className="text-sm">{batch.affiliateAccount.label}</p>
                  <p className="font-medium">{formatVnd(batch.totalAmountVnd)}</p>
                  <p className="ml-auto text-xs text-muted-foreground">
                    {batch.createdAt.toLocaleString("vi-VN")}
                  </p>
                </div>
              ))}
            </div>
            <PaginationNav
              currentPage={batchPage}
              totalItems={totalBatches}
              pageSize={PANEL_PAGE_SIZE}
              pathname="/app/reconciliation"
              query={{ page: params.page, importPage: params.importPage }}
              pageParam="batchPage"
              itemLabel="đợt đối soát"
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Thanh toán đơn hàng gần đây</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {conversions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có đơn hàng nào.</p>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trạng thái thanh toán</TableHead>
                      <TableHead>Nền tảng</TableHead>
                      <TableHead className="text-right">Hoa hồng thực nhận</TableHead>
                      <TableHead className="text-right">Cashback</TableHead>
                      <TableHead className="text-right">Ngày mua</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversions.map((conversion) => (
                      <TableRow key={conversion.id}>
                        <TableCell>
                          <Badge variant="outline">{conversion.settlementStatus}</Badge>
                        </TableCell>
                        <TableCell>{conversion.platform.replaceAll("_", " ")}</TableCell>
                        <TableCell className="text-right">
                          {formatVnd(conversion.netCommissionVnd)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatVnd(conversion.cashbackVnd)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {conversion.purchasedAt.toLocaleString("vi-VN")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 md:hidden">
                {conversions.map((conversion) => (
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
                ))}
              </div>
              <PaginationNav
                currentPage={currentPage}
                totalItems={totalConversions}
                pageSize={PAGE_SIZE}
                pathname="/app/reconciliation"
                query={{ importPage: params.importPage, batchPage: params.batchPage }}
                itemLabel="đơn hàng"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

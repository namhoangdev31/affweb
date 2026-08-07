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
import { db } from "@/lib/db";
import { paginationPage } from "@/lib/pagination";

const PAGE_SIZE = 20;

export default async function ConnectorsPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const totalConfigs = await db.connectorConfig.count();
  const currentPage = paginationPage(params.page, totalConfigs, PAGE_SIZE);
  const configs = await db.connectorConfig.findMany({
    include: { health: true, affiliateAccount: true },
    orderBy: [{ platform: "asc" }, { id: "asc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div>
      <h1 className="display-type text-4xl">Trạng thái kết nối hệ thống.</h1>
      <div className="mt-8 space-y-3">
        <Card className="hidden overflow-hidden py-0 md:block">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-5">Nền tảng</TableHead>
                <TableHead>Cổng kết nối / Tài khoản</TableHead>
                <TableHead>Chế độ</TableHead>
                <TableHead>Độ trễ</TableHead>
                <TableHead className="pr-5 text-right">Lần đồng bộ cuối</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="pl-5 font-medium">{config.platform}</TableCell>
                  <TableCell>
                    {config.connectorType} ·{" "}
                    {config.affiliateAccount?.label ?? "Chưa gắn tài khoản"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={config.enabled ? "default" : "secondary"}>
                      {config.enabled ? config.mode : "Tắt kết nối"}
                    </Badge>
                  </TableCell>
                  <TableCell>{config.health?.lagSeconds ?? "—"}s</TableCell>
                  <TableCell className="pr-5 text-right text-muted-foreground">
                    {config.health?.lastSuccessAt?.toLocaleString("vi-VN") ?? "Chưa đồng bộ"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <div className="space-y-3 md:hidden">
          {configs.map((config) => (
            <Card key={config.id}>
              <CardContent className="grid items-center gap-4 p-5 md:grid-cols-[1fr_auto_auto_auto]">
                <div>
                  <p className="font-semibold">{config.platform}</p>
                  <p className="text-sm text-muted-foreground">
                    {config.connectorType} ·{" "}
                    {config.affiliateAccount?.label ?? "Chưa gắn tài khoản"}
                  </p>
                </div>
                <Badge variant={config.enabled ? "default" : "secondary"}>
                  {config.enabled ? config.mode : "Tắt kết nối"}
                </Badge>
                <p className="text-sm">{config.health?.lagSeconds ?? "—"}s độ trễ</p>
                <p className="text-xs text-muted-foreground">
                  {config.health?.lastSuccessAt?.toLocaleString("vi-VN") ?? "Chưa đồng bộ"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        {!configs.length ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            Chưa có cấu hình cổng kết nối.
          </p>
        ) : (
          <PaginationNav
            currentPage={currentPage}
            totalItems={totalConfigs}
            pageSize={PAGE_SIZE}
            pathname="/admin/connectors"
            itemLabel="cổng kết nối"
          />
        )}
      </div>
    </div>
  );
}

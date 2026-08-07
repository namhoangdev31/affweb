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

const PAGE_SIZE = 20;

export default async function ConversionsPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const totalConversions = await db.conversion.count({ where: { userId: user.id } });
  const currentPage = paginationPage(params.page, totalConversions, PAGE_SIZE);

  const conversions = await db.conversion.findMany({
    where: { userId: user.id },
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Dữ liệu đối tác & phân quyền cashback</p>
        <h1 className="display-type mt-1 text-4xl">Đơn hàng & cashback.</h1>
      </div>

      {conversions.length ? (
        <div className="space-y-4">
          <Card className="hidden overflow-hidden py-0 md:block">
            <Table className="min-w-[900px]">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-5">Đơn hàng</TableHead>
                  <TableHead>Đối tác</TableHead>
                  <TableHead>Kênh / Nguồn</TableHead>
                  <TableHead>Ngày mua</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right pr-5">Cashback</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversions.map((conversion) => {
                  const isTenantChannel = conversion.click?.attributionMode === "TENANT_CHANNEL";
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
                      <TableCell className="max-w-44 whitespace-normal">
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
                      <TableCell className="text-right pr-5">
                        <p className="font-semibold tabular-nums">
                          {formatVnd(conversion.cashbackVnd)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isTenantChannel
                            ? "Trực thuộc Kênh Săn Sale"
                            : `${conversion.shareBps / 100}% chia lại`}
                        </p>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
                  <p className="text-xs text-muted-foreground">
                    {conversion.tenant ? `Kênh ${conversion.tenant.name}` : "Cá nhân"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <PaginationNav
            currentPage={currentPage}
            totalItems={totalConversions}
            pageSize={PAGE_SIZE}
            pathname="/app/conversions"
            query={{}}
            itemLabel="đơn hàng"
          />
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          Bạn chưa có đơn hàng cashback nào.
        </p>
      )}
    </div>
  );
}

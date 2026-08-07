import { AdminPasskey } from "@/components/admin-passkey";
import { TenantTreasuryActions } from "@/components/tenant-treasury-actions";
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

const PAGE_SIZE = 10;

export default async function ShopTenantTreasuryPage({
  params,
  searchParams
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ fundingPage?: string; withdrawalPage?: string }>;
}) {
  const { tenantId: paramId } = await params;
  const user = await requireUser();
  const query = await searchParams;
  const tenant = await db.tenant.findFirst({
    where: { OR: [{ id: paramId }, { slug: paramId.toLowerCase() }] }
  });
  const context = await requireTenantMasterContext(user.id, tenant?.id);
  const tenantId = context.ownedTenant!.id;
  const [totalOrders, totalPayouts] = await Promise.all([
    db.tenantFundingOrder.count({ where: { tenantId } }),
    db.tenantPayout.count({ where: { tenantId, kind: "TREASURY_WITHDRAWAL" } })
  ]);
  const fundingPage = paginationPage(query.fundingPage, totalOrders, PAGE_SIZE);
  const withdrawalPage = paginationPage(query.withdrawalPage, totalPayouts, PAGE_SIZE);
  const [treasury, masterWallet, beneficiary, orders, payouts] = await Promise.all([
    db.tenantTreasuryProjection.findUnique({ where: { tenantId } }),
    db.walletProjection.findUnique({ where: { userId: user.id } }),
    db.bankBeneficiary.findFirst({
      where: { userId: user.id, active: true },
      select: { id: true, bankBin: true, accountLast4: true, status: true }
    }),
    db.tenantFundingOrder.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      skip: (fundingPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    db.tenantPayout.findMany({
      where: { tenantId, kind: "TREASURY_WITHDRAWAL" },
      orderBy: { createdAt: "desc" },
      skip: (withdrawalPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    })
  ]);
  const value = treasury ?? {
    availableVnd: 0n,
    reservedVnd: 0n,
    paidVnd: 0n,
    withdrawnVnd: 0n
  };
  const pathname = `/shop/${tenantId}/treasury`;
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Quỹ Kênh Săn Sale</h1>
        <p className="text-muted-foreground">
          Số dư khả dụng có thể gửi yêu cầu rút tiền; yêu cầu sẽ được xử lý theo quy định bảo mật.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Khả dụng", value.availableVnd],
          ["Đang xử lý", value.reservedVnd],
          ["Đã chi member", value.paidVnd],
          ["Đã rút", value.withdrawnVnd]
        ].map(([label, amount]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{String(label)}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{formatVnd(amount as bigint)}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nạp, chuyển và rút quỹ</CardTitle>
        </CardHeader>
        <CardContent>
          <TenantTreasuryActions
            beneficiaryId={beneficiary?.id ?? null}
            masterWalletAvailableVnd={(masterWallet?.availableVnd ?? 0n).toString()}
          />
          <p className="mt-4 text-xs text-muted-foreground">
            Tài khoản nhận:{" "}
            {beneficiary
              ? `${beneficiary.bankBin} ••••${beneficiary.accountLast4}`
              : "chưa cấu hình"}
            .
          </p>
        </CardContent>
      </Card>
      <AdminPasskey
        apiBase="/api/v1/tenant/passkeys"
        description="Xác thực khóa bảo mật trước khi gửi yêu cầu rút tiền Quỹ Kênh. Phiên xác thực có hiệu lực 10 phút."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lịch sử nạp quỹ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">{order.orderCode}</TableCell>
                      <TableCell>{order.createdAt.toLocaleString("vi-VN")}</TableCell>
                      <TableCell className="text-right">{formatVnd(order.amountVnd)}</TableCell>
                      <TableCell>
                        <Badge>{order.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between border-b pb-3 text-sm"
                >
                  <span>{formatVnd(order.amountVnd)}</span>
                  <Badge>{order.status}</Badge>
                </div>
              ))}
              {!orders.length ? (
                <p className="text-sm text-muted-foreground">Chưa có lệnh nạp quỹ.</p>
              ) : null}
            </div>
            <div className="mt-4">
              <PaginationNav
                currentPage={fundingPage}
                totalItems={totalOrders}
                pageSize={PAGE_SIZE}
                pathname={pathname}
                query={{ withdrawalPage: String(withdrawalPage) }}
                pageParam="fundingPage"
                itemLabel="lệnh nạp"
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rút quỹ gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã giao dịch</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell className="font-mono text-xs">{payout.reference}</TableCell>
                      <TableCell>{payout.createdAt.toLocaleString("vi-VN")}</TableCell>
                      <TableCell className="text-right">{formatVnd(payout.amountVnd)}</TableCell>
                      <TableCell>
                        <Badge>{payout.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="flex items-center justify-between border-b pb-3 text-sm"
                >
                  <span>{formatVnd(payout.amountVnd)}</span>
                  <Badge>{payout.status}</Badge>
                </div>
              ))}
              {!payouts.length ? (
                <p className="text-sm text-muted-foreground">Chưa có yêu cầu rút quỹ.</p>
              ) : null}
            </div>
            <div className="mt-4">
              <PaginationNav
                currentPage={withdrawalPage}
                totalItems={totalPayouts}
                pageSize={PAGE_SIZE}
                pathname={pathname}
                query={{ fundingPage: String(fundingPage) }}
                pageParam="withdrawalPage"
                itemLabel="yêu cầu rút"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

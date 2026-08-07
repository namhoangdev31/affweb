import { TenantMemberPayoutForm } from "@/components/tenant-member-payout-form";
import { PaginationNav } from "@/components/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default async function ShopMyWalletPage({
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
  const tenantId = tenant.id;

  const searchP = await searchParams;
  const payoutWhere = { tenantId, userId: user.id, type: "MEMBER_WITHDRAWAL" as const };

  const [wallet, beneficiary, totalTickets, availableObligations] = await Promise.all([
    db.tenantMemberWalletProjection.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } }
    }),
    db.bankBeneficiary.findFirst({ where: { userId: user.id, active: true, status: "VERIFIED" } }),
    db.tenantPayout.count({ where: payoutWhere }),
    db.tenantCashbackObligation.findMany({
      where: { tenantId, userId: user.id, status: "AVAILABLE" },
      select: { fundedVnd: true, reservedVnd: true, paidVnd: true }
    })
  ]);

  const currentPage = paginationPage(searchP.page, totalTickets, PAGE_SIZE);
  const tickets = await db.tenantPayout.findMany({
    where: payoutWhere,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });

  const value = wallet ?? {
    pendingFundingVnd: 0n,
    availableVnd: 0n,
    reservedVnd: 0n,
    paidVnd: 0n,
    recoveryVnd: 0n
  };
  const obligationAvailableVnd = availableObligations.reduce(
    (total, obligation) =>
      total + obligation.fundedVnd - obligation.reservedVnd - obligation.paidVnd,
    0n
  );
  const withdrawableVnd =
    value.availableVnd < obligationAvailableVnd ? value.availableVnd : obligationAvailableVnd;

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Ví cashback cá nhân trong kênh <strong className="text-foreground">/{tenant.slug}</strong>
      </p>
      <h1 className="display-type mt-1 text-4xl">Ví cá nhân.</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {(
          [
            ["Chờ xử lý", value.pendingFundingVnd],
            ["Khả dụng", value.availableVnd],
            ["Có thể rút", withdrawableVnd],
            ["Đang rút", value.reservedVnd],
            ["Đã nhận", value.paidVnd]
          ] as const
        ).map(([label, amount]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-3 text-xl font-semibold">{formatVnd(amount)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(300px,0.7fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Tạo yêu cầu rút tiền</CardTitle>
          </CardHeader>
          <CardContent>
            <TenantMemberPayoutForm
              beneficiaryId={beneficiary?.id ?? null}
              availableVnd={withdrawableVnd.toString()}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lịch sử rút tiền</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tham chiếu</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-medium">{ticket.reference}</TableCell>
                      <TableCell>{ticket.createdAt.toLocaleDateString("vi-VN")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Badge variant="secondary">{ticket.approvalStatus}</Badge>
                          <Badge variant="outline">{ticket.settlementStatus}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatVnd(ticket.amountVnd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y md:hidden">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between py-3 first:pt-0">
                  <div>
                    <p className="text-sm font-medium">{ticket.reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {ticket.createdAt.toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatVnd(ticket.amountVnd)}</p>
                    <div className="flex gap-1">
                      <Badge variant="secondary">{ticket.approvalStatus}</Badge>
                      <Badge variant="outline">{ticket.settlementStatus}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!tickets.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Chưa có yêu cầu rút tiền.
              </p>
            ) : (
              <PaginationNav
                currentPage={currentPage}
                totalItems={totalTickets}
                pageSize={PAGE_SIZE}
                pathname={`/shop/${tenantId}/my-wallet`}
                itemLabel="yêu cầu"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

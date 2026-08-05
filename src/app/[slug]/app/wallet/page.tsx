import { TenantMemberPayoutForm } from "@/components/tenant-member-payout-form";
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

export default async function TenantUserWalletPage({
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
  const tenantId = context.memberTenant!.id;
  const payoutWhere = { tenantId, userId: user.id, kind: "MEMBER_WITHDRAWAL" as const };
  const totalPayouts = await db.tenantPayout.count({ where: payoutWhere });
  const currentPage = paginationPage(query.page, totalPayouts, PAGE_SIZE);
  const [wallet, beneficiary, payouts] = await Promise.all([
    db.tenantMemberWalletProjection.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } }
    }),
    db.bankBeneficiary.findFirst({ where: { userId: user.id, active: true } }),
    db.tenantPayout.findMany({
      where: payoutWhere,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    })
  ]);
  const availableObligations = await db.tenantCashbackObligation.findMany({
    where: { tenantId, userId: user.id, status: "AVAILABLE" },
    select: { fundedVnd: true, reservedVnd: true, paidVnd: true }
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
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ví {context.memberTenant!.name}</h1>
        <p className="text-muted-foreground">Ví này độc lập hoàn toàn với master wallet.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Chờ cấp vốn", value.pendingFundingVnd],
          ["Khả dụng", value.availableVnd],
          ["Có thể rút", withdrawableVnd],
          ["Đang rút", value.reservedVnd],
          ["Đã nhận", value.paidVnd]
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
          <CardTitle>Gửi yêu cầu rút tiền</CardTitle>
        </CardHeader>
        <CardContent>
          <TenantMemberPayoutForm
            beneficiaryId={beneficiary?.id ?? null}
            availableVnd={withdrawableVnd.toString()}
          />
          <p className="mt-4 text-xs text-muted-foreground">
            Yêu cầu sẽ được Tenant Master duyệt trước khi thanh toán.{" "}
            {beneficiary
              ? `Tài khoản ${beneficiary.bankBin} ••••${beneficiary.accountLast4}.`
              : "Hãy cấu hình tài khoản tại Cài đặt."}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lịch sử rút tiền</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã payout</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Tài khoản</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="font-mono text-xs">{payout.reference}</TableCell>
                    <TableCell>{payout.createdAt.toLocaleString("vi-VN")}</TableCell>
                    <TableCell>
                      {payout.bankBinSnapshot} ••••{payout.accountLast4Snapshot}
                    </TableCell>
                    <TableCell className="text-right">{formatVnd(payout.amountVnd)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Badge>{payout.approvalStatus}</Badge>
                        <Badge variant="outline">{payout.settlementStatus}</Badge>
                      </div>
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
                <span>
                  {formatVnd(payout.amountVnd)} · ••••{payout.accountLast4Snapshot}
                </span>
                <div className="flex gap-1">
                  <Badge>{payout.approvalStatus}</Badge>
                  <Badge variant="outline">{payout.settlementStatus}</Badge>
                </div>
              </div>
            ))}
            {!payouts.length ? (
              <p className="text-sm text-muted-foreground">Chưa có payout.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <PaginationNav
        currentPage={currentPage}
        totalItems={totalPayouts}
        pageSize={PAGE_SIZE}
        pathname={`/${slug}/app/wallet`}
        itemLabel="payout"
      />
    </div>
  );
}

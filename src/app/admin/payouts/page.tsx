import {
  approveTenantPayoutAction,
  completeManualPayoutAction,
  markManualUnknownAction,
  reconcileTenantPayoutAction,
  rejectTenantPayoutAction,
  resolveLegacyPayoutAction,
  resolveManualUnknownAction,
  startManualPayoutAction,
  resumeTenantPayoutAction
} from "@/app/admin/payouts/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { formatVnd } from "@/lib/utils";

const PAGE_SIZE = 20;

export default async function PayoutsPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; tenantId?: string }>;
}) {
  const params = await searchParams;
  const where = params.tenantId ? { tenantId: params.tenantId } : {};
  const totalTickets = await db.tenantPayout.count({ where });
  const currentPage = paginationPage(params.page, totalTickets, PAGE_SIZE);
  const tickets = await db.tenantPayout.findMany({
    where,
    include: {
      user: { select: { email: true } },
      tenant: { select: { name: true, slug: true } },
      beneficiary: { select: { bankBin: true, accountLast4: true } }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });

  return (
    <div>
      <h1 className="display-type text-4xl">Platform Payout Queue.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tài chính phân cấp Owner → Tenant Master → Tenant User. Thao tác duyệt yêu cầu passkey.
      </p>
      <div className="mt-8 space-y-4">
        <Card className="hidden overflow-hidden py-0 lg:block">
          <Table className="min-w-[1100px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-5">Tham chiếu</TableHead>
                <TableHead>Tenant / User</TableHead>
                <TableHead>Ngân hàng</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Settlement</TableHead>
                <TableHead className="pr-5">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="pl-5 font-medium">{ticket.reference}</TableCell>
                  <TableCell>
                    <div className="font-semibold">{ticket.tenant.name}</div>
                    <div className="text-xs text-muted-foreground">{ticket.user.email}</div>
                  </TableCell>
                  <TableCell>
                    BIN {ticket.beneficiary.bankBin} •••• {ticket.beneficiary.accountLast4}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatVnd(ticket.amountVnd)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ticket.approvalStatus === "APPROVED" ? "default" : "secondary"}>
                      {ticket.approvalStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ticket.settlementStatus === "PAID" ? "default" : "outline"}>
                      {ticket.settlementStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-5">
                    {ticket.approvalStatus === "PENDING" ? (
                      <div className="flex gap-2">
                        <form action={approveTenantPayoutAction} className="flex gap-2">
                          <input type="hidden" name="payoutId" value={ticket.id} />
                          <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                          <select
                            name="method"
                            required
                            defaultValue="PAYOS"
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                          >
                            <option value="PAYOS">PayOS</option>
                            <option value="MANUAL_BANK_TRANSFER">Chuyển khoản</option>
                          </select>
                          <Input name="note" placeholder="Ghi chú" className="w-32" />
                          <Button size="sm" type="submit">
                            Duyệt
                          </Button>
                        </form>
                        <form action={rejectTenantPayoutAction} className="flex gap-2">
                          <input type="hidden" name="payoutId" value={ticket.id} />
                          <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                          <Input name="reason" required placeholder="Lý do" className="w-32" />
                          <Button size="sm" variant="destructive" type="submit">
                            Từ chối
                          </Button>
                        </form>
                      </div>
                    ) : null}
                    {ticket.approvalStatus === "APPROVED" &&
                    ticket.settlementStatus === "UNKNOWN" ? (
                      <form action={reconcileTenantPayoutAction}>
                        <input type="hidden" name="payoutId" value={ticket.id} />
                        <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                        <Button size="sm" variant="outline" type="submit">
                          Đối soát PayOS
                        </Button>
                      </form>
                    ) : null}
                    {ticket.approvalStatus === "APPROVED" &&
                    ticket.settlementStatus === "NOT_STARTED" &&
                    ticket.method === "PAYOS" ? (
                      <form action={resumeTenantPayoutAction}>
                        <input type="hidden" name="payoutId" value={ticket.id} />
                        <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                        <Button size="sm" variant="outline" type="submit">
                          Resume
                        </Button>
                      </form>
                    ) : null}
                    {ticket.approvalStatus === "APPROVED" &&
                    ticket.settlementStatus === "NOT_STARTED" &&
                    ticket.method === "MANUAL_BANK_TRANSFER" ? (
                      <form action={startManualPayoutAction}>
                        <input type="hidden" name="payoutId" value={ticket.id} />
                        <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                        <Button size="sm" variant="outline" type="submit">
                          Bắt đầu chuyển khoản
                        </Button>
                      </form>
                    ) : null}
                    {ticket.method === "MANUAL_BANK_TRANSFER" &&
                    ticket.settlementStatus === "PROCESSING" ? (
                      <div className="space-y-2">
                        <a
                          className="text-xs underline"
                          href={`/api/v1/admin/tenants/${ticket.tenantId}/payouts/${ticket.id}/beneficiary`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Mở beneficiary bảo mật
                        </a>
                        <form action={completeManualPayoutAction} className="flex gap-2">
                          <input type="hidden" name="payoutId" value={ticket.id} />
                          <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                          <Input
                            name="transferReference"
                            required
                            placeholder="Mã GD"
                            className="w-28"
                          />
                          <Input
                            name="evidenceReference"
                            required
                            placeholder="Evidence"
                            className="w-28"
                          />
                          <Input name="note" required placeholder="Ghi chú" className="w-28" />
                          <Button size="sm" type="submit">
                            Hoàn tất
                          </Button>
                        </form>
                        <form action={markManualUnknownAction} className="flex gap-2">
                          <input type="hidden" name="payoutId" value={ticket.id} />
                          <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                          <Input
                            name="evidenceReference"
                            required
                            placeholder="Evidence"
                            className="w-28"
                          />
                          <Input
                            name="note"
                            required
                            placeholder="Lý do chưa rõ"
                            className="w-32"
                          />
                          <Button size="sm" variant="outline" type="submit">
                            Đánh dấu UNKNOWN
                          </Button>
                        </form>
                      </div>
                    ) : null}
                    {ticket.method === "MANUAL_BANK_TRANSFER" &&
                    ticket.settlementStatus === "UNKNOWN" ? (
                      <form action={resolveManualUnknownAction} className="flex gap-2">
                        <input type="hidden" name="payoutId" value={ticket.id} />
                        <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                        <select
                          name="resolution"
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                        >
                          <option value="REMAIN_UNKNOWN">Giữ UNKNOWN</option>
                          <option value="CONFIRMED_PAID">Xác nhận PAID</option>
                          <option value="CONFIRMED_NOT_SENT">Xác nhận chưa gửi</option>
                        </select>
                        <Input
                          name="evidenceReference"
                          required
                          placeholder="Evidence"
                          className="w-28"
                        />
                        <Input name="note" required placeholder="Lý do" className="w-28" />
                        <Button size="sm" variant="outline" type="submit">
                          Resolve
                        </Button>
                      </form>
                    ) : null}
                    {ticket.legacyResolutionStatus !== "NOT_REQUIRED" &&
                    ticket.legacyResolutionStatus !== "RESOLVED" ? (
                      <form action={resolveLegacyPayoutAction} className="mt-2 flex gap-2">
                        <input type="hidden" name="payoutId" value={ticket.id} />
                        <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                        <select
                          name="decision"
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                        >
                          <option value="REMAIN_UNKNOWN">Giữ review</option>
                          <option value="CONFIRMED_PAID">Đã trả</option>
                          <option value="CONFIRMED_FAILED">Thất bại</option>
                          <option value="CONFIRMED_NOT_SUBMITTED">Chưa gửi</option>
                        </select>
                        <Input
                          name="providerReference"
                          placeholder="Provider ref"
                          className="w-28"
                        />
                        <Input
                          name="evidenceReference"
                          required
                          placeholder="Evidence"
                          className="w-28"
                        />
                        <Input name="reason" required placeholder="Lý do" className="w-28" />
                        <Button size="sm" variant="outline" type="submit">
                          Resolve legacy
                        </Button>
                      </form>
                    ) : null}
                    {ticket.approvalStatus !== "PENDING" &&
                    ticket.settlementStatus !== "UNKNOWN" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <div className="space-y-4 lg:hidden">
          {tickets.map((ticket) => (
            <Card key={ticket.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{ticket.reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {ticket.tenant.name} · {ticket.user.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      BIN {ticket.beneficiary.bankBin} •••• {ticket.beneficiary.accountLast4}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatVnd(ticket.amountVnd)}</p>
                    <div className="flex flex-col items-end gap-1">
                      <Badge>{ticket.approvalStatus}</Badge>
                      <Badge variant="outline">{ticket.settlementStatus}</Badge>
                    </div>
                  </div>
                </div>
                {ticket.approvalStatus === "PENDING" ? (
                  <div className="mt-4 flex gap-2">
                    <form action={approveTenantPayoutAction} className="flex gap-2">
                      <input type="hidden" name="payoutId" value={ticket.id} />
                      <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                      <select
                        name="method"
                        required
                        defaultValue="PAYOS"
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="PAYOS">PayOS</option>
                        <option value="MANUAL_BANK_TRANSFER">Chuyển khoản</option>
                      </select>
                      <Input name="note" placeholder="Ghi chú" className="w-36" />
                      <Button size="sm" type="submit">
                        Duyệt
                      </Button>
                    </form>
                    <form action={rejectTenantPayoutAction} className="flex gap-2">
                      <input type="hidden" name="payoutId" value={ticket.id} />
                      <input type="hidden" name="targetTenantId" value={ticket.tenantId} />
                      <Input name="reason" required placeholder="Lý do" className="w-32" />
                      <Button size="sm" variant="destructive" type="submit">
                        Từ chối
                      </Button>
                    </form>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
        {!tickets.length ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            Queue trống.
          </p>
        ) : (
          <PaginationNav
            currentPage={currentPage}
            totalItems={totalTickets}
            pageSize={PAGE_SIZE}
            pathname="/admin/payouts"
            itemLabel="payout"
          />
        )}
      </div>
    </div>
  );
}

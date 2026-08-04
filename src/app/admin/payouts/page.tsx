import {
  approvePayoutAction,
  reviewPayoutAction,
  submitPayoutAction
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
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const totalTickets = await db.payoutTicket.count();
  const currentPage = paginationPage(params.page, totalTickets, PAGE_SIZE);
  const tickets = await db.payoutTicket.findMany({
    include: {
      user: { select: { email: true } },
      beneficiary: { select: { bankBin: true, accountLast4: true } },
      approvals: true
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div>
      <h1 className="display-type text-4xl">Payout queue.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Finance actions cần passkey step-up trong 10 phút gần nhất.
      </p>
      <div className="mt-8 space-y-4">
        <Card className="hidden overflow-hidden py-0 lg:block">
          <Table className="min-w-[1100px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-5">Tham chiếu</TableHead>
                <TableHead>Người dùng</TableHead>
                <TableHead>Ngân hàng</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="pr-5">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="pl-5 font-medium">{ticket.reference}</TableCell>
                  <TableCell>{ticket.user.email}</TableCell>
                  <TableCell>
                    BIN {ticket.beneficiary.bankBin} •••• {ticket.beneficiary.accountLast4}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatVnd(ticket.amountVnd)}
                  </TableCell>
                  <TableCell>
                    <Badge>{ticket.status}</Badge>
                  </TableCell>
                  <TableCell className="pr-5">
                    {ticket.status === "RESERVED" ? (
                      <form action={reviewPayoutAction} className="flex gap-2">
                        <input type="hidden" name="payoutTicketId" value={ticket.id} />
                        <Input name="comment" placeholder="Ghi chú review" className="w-44" />
                        <Button size="sm" type="submit">
                          Review
                        </Button>
                      </form>
                    ) : null}
                    {ticket.status === "REVIEWED" ? (
                      <form action={approvePayoutAction} className="flex gap-2">
                        <input type="hidden" name="payoutTicketId" value={ticket.id} />
                        <Input name="comment" placeholder="Ghi chú approve" className="w-44" />
                        <Button size="sm" type="submit">
                          Approve
                        </Button>
                      </form>
                    ) : null}
                    {ticket.status === "APPROVED" ? (
                      <form action={submitPayoutAction}>
                        <input type="hidden" name="payoutTicketId" value={ticket.id} />
                        <Button size="sm" type="submit">
                          Submit payOS
                        </Button>
                      </form>
                    ) : null}
                    {!["RESERVED", "REVIEWED", "APPROVED"].includes(ticket.status) ? (
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
                    <p className="text-sm text-muted-foreground">
                      {ticket.user.email} · BIN {ticket.beneficiary.bankBin} ••••{" "}
                      {ticket.beneficiary.accountLast4}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatVnd(ticket.amountVnd)}</p>
                    <Badge>{ticket.status}</Badge>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {ticket.status === "RESERVED" ? (
                    <form action={reviewPayoutAction} className="flex gap-2">
                      <input type="hidden" name="payoutTicketId" value={ticket.id} />
                      <Input name="comment" placeholder="Ghi chú review" className="w-52" />
                      <Button size="sm" type="submit">
                        Review
                      </Button>
                    </form>
                  ) : null}
                  {ticket.status === "REVIEWED" ? (
                    <form action={approvePayoutAction} className="flex gap-2">
                      <input type="hidden" name="payoutTicketId" value={ticket.id} />
                      <Input name="comment" placeholder="Ghi chú approve" className="w-52" />
                      <Button size="sm" type="submit">
                        Approve
                      </Button>
                    </form>
                  ) : null}
                  {ticket.status === "APPROVED" ? (
                    <form action={submitPayoutAction}>
                      <input type="hidden" name="payoutTicketId" value={ticket.id} />
                      <Button size="sm" type="submit">
                        Submit payOS
                      </Button>
                    </form>
                  ) : null}
                </div>
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

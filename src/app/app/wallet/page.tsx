import { PayoutForm } from "@/components/payout-form";
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

const PAGE_SIZE = 10;

export default async function WalletPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [wallet, beneficiary, totalTickets] = await Promise.all([
    db.walletProjection.findUnique({ where: { userId: user.id } }),
    db.bankBeneficiary.findFirst({ where: { userId: user.id, active: true, status: "VERIFIED" } }),
    db.payoutTicket.count({ where: { userId: user.id } })
  ]);
  const currentPage = paginationPage(params.page, totalTickets, PAGE_SIZE);
  const tickets = await db.payoutTicket.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  const value = wallet ?? { pendingVnd: 0n, availableVnd: 0n, reservedVnd: 0n, paidVnd: 0n };
  return (
    <div>
      <p className="text-sm text-muted-foreground">Ledger là nguồn sự thật</p>
      <h1 className="display-type mt-1 text-4xl">Ví cashback.</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {[
          ["Pending", value.pendingVnd],
          ["Available", value.availableVnd],
          ["Reserved", value.reservedVnd],
          ["Paid", value.paidVnd]
        ].map(([label, amount]) => (
          <Card key={String(label)}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{String(label)}</p>
              <p className="mt-3 text-xl font-semibold">{formatVnd(amount as bigint)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(300px,0.7fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Tạo payout</CardTitle>
          </CardHeader>
          <CardContent>
            <PayoutForm
              beneficiaryId={beneficiary?.id ?? null}
              availableVnd={value.availableVnd.toString()}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lịch sử payout</CardTitle>
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
                        <Badge variant="secondary">{ticket.status}</Badge>
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
                    <Badge variant="secondary">{ticket.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
            {!tickets.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Chưa có payout ticket.
              </p>
            ) : (
              <PaginationNav
                currentPage={currentPage}
                totalItems={totalTickets}
                pageSize={PAGE_SIZE}
                pathname="/app/wallet"
                itemLabel="payout"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { PayoutForm } from "@/components/payout-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

export default async function WalletPage() {
  const user = await requireUser();
  const [wallet, beneficiary, tickets] = await Promise.all([
    db.walletProjection.findUnique({ where: { userId: user.id } }),
    db.bankBeneficiary.findFirst({ where: { userId: user.id, active: true, status: "VERIFIED" } }),
    db.payoutTicket.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);
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
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
          <CardContent className="divide-y">
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
            {!tickets.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Chưa có payout ticket.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

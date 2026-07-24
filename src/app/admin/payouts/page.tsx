import {
  approvePayoutAction,
  reviewPayoutAction,
  submitPayoutAction
} from "@/app/admin/payouts/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

export default async function PayoutsPage() {
  const tickets = await db.payoutTicket.findMany({
    include: {
      user: { select: { email: true } },
      beneficiary: { select: { bankBin: true, accountLast4: true } },
      approvals: true
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return (
    <div>
      <h1 className="display-type text-4xl">Payout queue.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Finance actions cần passkey step-up trong 10 phút gần nhất.
      </p>
      <div className="mt-8 space-y-4">
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
        {!tickets.length ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            Queue trống.
          </p>
        ) : null}
      </div>
    </div>
  );
}

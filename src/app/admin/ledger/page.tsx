import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

export default async function LedgerPage() {
  const transactions = await db.ledgerTransaction.findMany({
    include: { entries: { include: { account: true } } },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return (
    <div>
      <h1 className="display-type text-4xl">Ledger explorer.</h1>
      <div className="mt-8 space-y-4">
        {transactions.map((transaction) => (
          <Card key={transaction.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge>{transaction.type}</Badge>
                <p className="flex-1 font-medium">{transaction.description}</p>
                <p className="text-xs text-muted-foreground">
                  {transaction.createdAt.toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="mt-4 divide-y rounded-xl bg-muted/60 px-4">
                {transaction.entries.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-[90px_1fr_auto] gap-3 py-2 text-sm">
                    <span>{entry.direction}</span>
                    <span className="font-mono text-xs">{entry.account.code}</span>
                    <span>{formatVnd(entry.amountVnd)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

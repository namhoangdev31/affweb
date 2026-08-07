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
import { db } from "@/lib/db";
import { paginationPage } from "@/lib/pagination";
import { formatVnd } from "@/lib/utils";

const PAGE_SIZE = 20;

export default async function LedgerPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const totalTransactions = await db.ledgerTransaction.count();
  const currentPage = paginationPage(params.page, totalTransactions, PAGE_SIZE);
  const transactions = await db.ledgerTransaction.findMany({
    include: { entries: { include: { account: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div>
      <h1 className="display-type text-4xl">Sổ kế toán hệ thống.</h1>
      <div className="mt-8 space-y-4">
        <Card className="hidden overflow-hidden py-0 md:block">
          <Table className="min-w-[900px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-5">Loại</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead>Bút toán</TableHead>
                <TableHead className="pr-5 text-right">Thời gian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="pl-5">
                    <Badge>{transaction.type}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    {transaction.description}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="space-y-1">
                      {transaction.entries.map((entry) => (
                        <p key={entry.id} className="font-mono text-xs">
                          {entry.direction} · {entry.account.code} · {formatVnd(entry.amountVnd)}
                        </p>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="pr-5 text-right text-muted-foreground">
                    {transaction.createdAt.toLocaleString("vi-VN")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <div className="space-y-4 md:hidden">
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
                    <div
                      key={entry.id}
                      className="grid grid-cols-[90px_1fr_auto] gap-3 py-2 text-sm"
                    >
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
        {transactions.length ? (
          <PaginationNav
            currentPage={currentPage}
            totalItems={totalTransactions}
            pageSize={PAGE_SIZE}
            pathname="/admin/ledger"
            itemLabel="giao dịch"
          />
        ) : null}
      </div>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { PayoutSettlementStatus, Prisma } from "@/generated/prisma/client";
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
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { paginationPage } from "@/lib/pagination";

const PAGE_SIZE = 50;

export default async function FinanceHealthPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; tenantId?: string }>;
}) {
  const params = await searchParams;
  const env = loadServerEnv();
  const timeRows = await db.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
  const currentTime = timeRows[0]?.now.getTime() ?? 0;
  const staleApproved = new Date(currentTime - env.FINANCE_APPROVED_STALE_MINUTES * 60_000);
  const staleProcessing = new Date(currentTime - env.FINANCE_PROCESSING_STALE_MINUTES * 60_000);
  const unknownSla = new Date(currentTime - env.FINANCE_UNKNOWN_SLA_MINUTES * 60_000);
  const where: Prisma.TenantPayoutWhereInput = {
    ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    OR: [
      {
        approvalStatus: "APPROVED" as const,
        settlementStatus: "NOT_STARTED" as const,
        approvedAt: { lte: staleApproved }
      },
      { settlementStatus: "PROCESSING" as const, updatedAt: { lte: staleProcessing } },
      { settlementStatus: "UNKNOWN" as const, updatedAt: { lte: unknownSla } },
      { requiresManualReview: true },
      {
        settlementStatus: { in: [PayoutSettlementStatus.PAID, PayoutSettlementStatus.FAILED] },
        terminalJournalId: null
      }
    ]
  };
  const total = await db.tenantPayout.count({ where });
  const page = paginationPage(params.page, total, PAGE_SIZE);
  const records = await db.tenantPayout.findMany({
    where,
    include: { tenant: { select: { name: true } } },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  const [unknown, manualReview, pendingQStash] = await Promise.all([
    db.tenantPayout.count({ where: { settlementStatus: "UNKNOWN" } }),
    db.tenantPayout.count({ where: { requiresManualReview: true } }),
    db.tenantPayoutExecutionIntent.count({ where: { dispatchStatus: "FAILED" } })
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="display-type text-4xl">Finance health.</h1>
        <p className="text-muted-foreground">
          On-demand, index-bounded view; provider không được gọi khi mở trang.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["UNKNOWN", unknown],
          ["Manual review", manualReview],
          ["Dispatch failed", pendingQStash]
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader>
              <CardTitle className="text-sm">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{value}</CardContent>
          </Card>
        ))}
      </div>
      <Card className="hidden overflow-hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead>Settlement</TableHead>
              <TableHead>Review</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{record.tenant.name}</TableCell>
                <TableCell>{record.reference}</TableCell>
                <TableCell>
                  <Badge>{record.approvalStatus}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{record.settlementStatus}</Badge>
                </TableCell>
                <TableCell>{record.reviewReason ?? "—"}</TableCell>
                <TableCell>{record.updatedAt.toLocaleString("vi-VN")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="space-y-3 md:hidden">
        {records.map((record) => (
          <Card key={record.id}>
            <CardContent className="p-5">
              <p className="font-semibold">{record.reference}</p>
              <p className="text-sm">{record.tenant.name}</p>
              <div className="mt-2 flex gap-2">
                <Badge>{record.approvalStatus}</Badge>
                <Badge variant="outline">{record.settlementStatus}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {record.reviewReason ?? "Không có review reason"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <PaginationNav
        currentPage={page}
        totalItems={total}
        pageSize={PAGE_SIZE}
        pathname="/admin/finance/health"
        itemLabel="record"
      />
    </div>
  );
}

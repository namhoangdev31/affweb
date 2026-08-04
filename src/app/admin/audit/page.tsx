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

const PAGE_SIZE = 25;

export default async function AuditPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const totalEvents = await db.auditLog.count();
  const currentPage = paginationPage(params.page, totalEvents, PAGE_SIZE);
  const events = await db.auditLog.findMany({
    include: { actor: { select: { email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div>
      <h1 className="display-type text-4xl">Audit log.</h1>
      <div className="mt-8 space-y-4">
        <Card className="hidden overflow-hidden py-0 md:block">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-5">Hành động</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Đối tượng</TableHead>
                <TableHead className="pr-5 text-right">Thời gian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="pl-5">
                    <Badge variant="secondary">{event.action}</Badge>
                  </TableCell>
                  <TableCell>{event.actor?.email ?? "system"}</TableCell>
                  <TableCell>
                    {event.entityType} · {event.entityId ?? "—"}
                  </TableCell>
                  <TableCell className="pr-5 text-right text-muted-foreground">
                    {event.createdAt.toLocaleString("vi-VN")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <div className="space-y-2 md:hidden">
          {events.map((event) => (
            <Card key={event.id}>
              <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-[auto_1fr_1fr_auto]">
                <Badge variant="secondary">{event.action}</Badge>
                <span>{event.actor?.email ?? "system"}</span>
                <span>
                  {event.entityType} · {event.entityId ?? "—"}
                </span>
                <span className="text-muted-foreground">
                  {event.createdAt.toLocaleString("vi-VN")}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
        {events.length ? (
          <PaginationNav
            currentPage={currentPage}
            totalItems={totalEvents}
            pageSize={PAGE_SIZE}
            pathname="/admin/audit"
            itemLabel="sự kiện"
          />
        ) : null}
      </div>
    </div>
  );
}

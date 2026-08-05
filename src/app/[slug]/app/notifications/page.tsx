import { Bell } from "lucide-react";
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
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { paginationPage } from "@/lib/pagination";
import { requireTenantUserContext } from "@/modules/tenants/persona";

const PAGE_SIZE = 20;

export default async function TenantUserNotificationsPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const query = await searchParams;
  await requireTenantUserContext(user.id, slug);
  const total = await db.notification.count({ where: { userId: user.id } });
  const currentPage = paginationPage(query.page, total, PAGE_SIZE);
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Thông báo</h1>
      <Card className="hidden overflow-hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thông báo</TableHead>
              <TableHead>Nội dung</TableHead>
              <TableHead>Thời gian</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notifications.map((notification) => (
              <TableRow key={notification.id}>
                <TableCell className="font-medium">{notification.title}</TableCell>
                <TableCell className="max-w-xl whitespace-normal">{notification.body}</TableCell>
                <TableCell>{notification.createdAt.toLocaleString("vi-VN")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="grid gap-3 md:hidden">
        {notifications.map((notification) => (
          <Card key={notification.id}>
            <CardContent className="flex gap-3 pt-6">
              <Bell className="size-5 shrink-0" />
              <div>
                <p className="font-medium">{notification.title}</p>
                <p className="text-sm text-muted-foreground">{notification.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {notification.createdAt.toLocaleString("vi-VN")}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!notifications.length ? <p className="text-muted-foreground">Chưa có thông báo.</p> : null}
      <PaginationNav
        currentPage={currentPage}
        totalItems={total}
        pageSize={PAGE_SIZE}
        pathname={`/${slug}/app/notifications`}
        itemLabel="thông báo"
      />
    </div>
  );
}

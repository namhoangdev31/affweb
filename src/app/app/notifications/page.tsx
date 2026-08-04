import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { markAllNotificationsReadAction } from "./actions";

const PAGE_SIZE = 20;

export default async function NotificationsPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [totalNotifications, unreadNotifications] = await Promise.all([
    db.notification.count({ where: { userId: user.id } }),
    db.notification.count({ where: { userId: user.id, readAt: null } })
  ]);
  const currentPage = paginationPage(params.page, totalNotifications, PAGE_SIZE);
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div>
      <p className="text-sm text-muted-foreground">Đơn, tiền và payout</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display-type mt-1 text-4xl">Thông báo.</h1>
        {unreadNotifications > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline">
              Đánh dấu đã đọc
            </Button>
          </form>
        ) : null}
      </div>
      <div className="mt-8 space-y-4">
        <Card className="hidden overflow-hidden py-0 md:block">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-5">Trạng thái</TableHead>
                <TableHead>Tiêu đề</TableHead>
                <TableHead>Nội dung</TableHead>
                <TableHead className="pr-5 text-right">Thời gian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((notification) => (
                <TableRow key={notification.id}>
                  <TableCell className="pl-5">
                    <span className="inline-flex items-center gap-2">
                      {notification.readAt ? (
                        <Check className="size-4" />
                      ) : (
                        <Bell className="size-4" />
                      )}
                      {notification.readAt ? "Đã đọc" : "Chưa đọc"}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{notification.title}</TableCell>
                  <TableCell className="max-w-xl whitespace-normal text-muted-foreground">
                    {notification.body}
                  </TableCell>
                  <TableCell className="pr-5 text-right text-muted-foreground">
                    {notification.createdAt.toLocaleString("vi-VN")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <div className="space-y-3 md:hidden">
          {notifications.map((notification) => (
            <Card key={notification.id}>
              <CardContent className="flex gap-4 p-5">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary">
                  {notification.readAt ? <Check className="size-4" /> : <Bell className="size-4" />}
                </div>
                <div>
                  <p className="font-medium">{notification.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {notification.createdAt.toLocaleString("vi-VN")}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {!notifications.length ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            Chưa có thông báo.
          </p>
        ) : (
          <PaginationNav
            currentPage={currentPage}
            totalItems={totalNotifications}
            pageSize={PAGE_SIZE}
            pathname="/app/notifications"
            itemLabel="thông báo"
          />
        )}
      </div>
    </div>
  );
}

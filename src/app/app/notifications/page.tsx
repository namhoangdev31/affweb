import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { markAllNotificationsReadAction } from "./actions";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return (
    <div>
      <p className="text-sm text-muted-foreground">Đơn, tiền và payout</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display-type mt-1 text-4xl">Thông báo.</h1>
        {notifications.some((notification) => !notification.readAt) ? (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline">
              Đánh dấu đã đọc
            </Button>
          </form>
        ) : null}
      </div>
      <div className="mt-8 space-y-3">
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
        {!notifications.length ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            Chưa có thông báo.
          </p>
        ) : null}
      </div>
    </div>
  );
}

import {
  approveAdjustmentAction,
  createAdjustmentAction,
  reviewAdjustmentAction
} from "@/app/admin/adjustments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

export default async function AdjustmentsPage() {
  const [adjustments, users] = await Promise.all([
    db.balanceAdjustment.findMany({
      include: { targetUser: { select: { email: true } }, createdBy: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    db.user.findMany({ select: { id: true, email: true }, where: { status: "ACTIVE" }, take: 100 })
  ]);
  return (
    <div>
      <h1 className="display-type text-4xl">Balance adjustments.</h1>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {adjustments.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge>{item.status}</Badge>
                  <p className="flex-1 font-medium">{item.targetUser.email}</p>
                  <p
                    className={
                      item.amountVnd > 0n
                        ? "font-semibold text-primary"
                        : "font-semibold text-destructive"
                    }
                  >
                    {formatVnd(item.amountVnd)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.reason} · tạo bởi {item.createdBy.email}
                </p>
                <div className="mt-4 flex gap-2">
                  {item.status === "DRAFT" ? (
                    <form action={reviewAdjustmentAction}>
                      <input type="hidden" name="adjustmentId" value={item.id} />
                      <Button size="sm" type="submit">
                        Review
                      </Button>
                    </form>
                  ) : null}
                  {item.status === "REVIEWED" ? (
                    <form action={approveAdjustmentAction}>
                      <input type="hidden" name="adjustmentId" value={item.id} />
                      <Button size="sm" type="submit">
                        Approve & post
                      </Button>
                    </form>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Tạo yêu cầu</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createAdjustmentAction} className="space-y-4">
              <div>
                <Label htmlFor="targetUserId">User</Label>
                <select
                  id="targetUserId"
                  name="targetUserId"
                  required
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {users.map((user) => (
                    <option value={user.id} key={user.id}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="amountVnd">Số tiền signed VND</Label>
                <Input id="amountVnd" name="amountVnd" type="number" step="1000" required />
              </div>
              <div>
                <Label htmlFor="reason">Lý do</Label>
                <Input id="reason" name="reason" minLength={12} required />
              </div>
              <Button type="submit">Tạo draft</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

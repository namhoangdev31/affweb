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

export default async function AdjustmentsPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const [totalAdjustments, users] = await Promise.all([
    db.balanceAdjustment.count(),
    db.user.findMany({ select: { id: true, email: true }, where: { status: "ACTIVE" }, take: 100 })
  ]);
  const currentPage = paginationPage(params.page, totalAdjustments, PAGE_SIZE);
  const adjustments = await db.balanceAdjustment.findMany({
    include: { targetUser: { select: { email: true } }, createdBy: { select: { email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div>
      <h1 className="display-type text-4xl">Điều chỉnh số dư.</h1>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <Card className="hidden overflow-hidden py-0 md:block">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-5">Trạng thái</TableHead>
                  <TableHead>Người dùng</TableHead>
                  <TableHead>Lý do / Người tạo</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead className="pr-5">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="pl-5">
                      <Badge>{item.status}</Badge>
                    </TableCell>
                    <TableCell>{item.targetUser.email}</TableCell>
                    <TableCell className="max-w-sm whitespace-normal">
                      {item.reason} · {item.createdBy.email}
                    </TableCell>
                    <TableCell
                      className={
                        item.amountVnd > 0n
                          ? "text-right font-semibold text-primary"
                          : "text-right font-semibold text-destructive"
                      }
                    >
                      {formatVnd(item.amountVnd)}
                    </TableCell>
                    <TableCell className="pr-5">
                      {item.status === "DRAFT" ? (
                        <form action={reviewAdjustmentAction}>
                          <input type="hidden" name="adjustmentId" value={item.id} />
                          <Button size="sm" type="submit">
                            Kiểm duyệt
                          </Button>
                        </form>
                      ) : null}
                      {item.status === "REVIEWED" ? (
                        <form action={approveAdjustmentAction}>
                          <input type="hidden" name="adjustmentId" value={item.id} />
                          <Button size="sm" type="submit">
                            Duyệt & Ghi sổ
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="space-y-3 md:hidden">
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
                          Kiểm duyệt
                        </Button>
                      </form>
                    ) : null}
                    {item.status === "REVIEWED" ? (
                      <form action={approveAdjustmentAction}>
                        <input type="hidden" name="adjustmentId" value={item.id} />
                        <Button size="sm" type="submit">
                          Duyệt & Ghi sổ
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {adjustments.length ? (
            <PaginationNav
              currentPage={currentPage}
              totalItems={totalAdjustments}
              pageSize={PAGE_SIZE}
              pathname="/admin/adjustments"
              itemLabel="điều chỉnh"
            />
          ) : null}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Tạo yêu cầu</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createAdjustmentAction} className="space-y-4">
              <div>
                <Label htmlFor="targetUserId">Tài khoản nhận</Label>
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
                <Label htmlFor="amountVnd">Số tiền VND (+ / -)</Label>
                <Input id="amountVnd" name="amountVnd" type="number" step="1000" required />
              </div>
              <div>
                <Label htmlFor="reason">Lý do</Label>
                <Input id="reason" name="reason" minLength={12} required />
              </div>
              <Button type="submit">Tạo bản nháp</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

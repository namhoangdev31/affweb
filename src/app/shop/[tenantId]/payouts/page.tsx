import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { formatVnd } from "@/lib/utils";
import { requireTenantMasterContext } from "@/modules/tenants/persona";
import {
  tenantApprovePayoutAction,
  tenantPayoutOperationAction,
  tenantRejectPayoutAction
} from "./actions";

const PAGE_SIZE = 20;

export default async function ShopTenantPayoutQueue({
  params,
  searchParams
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { tenantId: paramId } = await params;
  const user = await requireUser();
  const tenantObj = await db.tenant.findFirst({
    where: { OR: [{ id: paramId }, { slug: paramId.toLowerCase() }] }
  });
  const tenant = (await requireTenantMasterContext(user.id, tenantObj?.id)).ownedTenant!;
  const query = await searchParams;
  const where = {
    tenantId: tenant.id,
    kind: "MEMBER_WITHDRAWAL" as const,
    ...(query.status
      ? { approvalStatus: query.status as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" }
      : {})
  };
  const total = await db.tenantPayout.count({ where });
  const page = paginationPage(query.page, total, PAGE_SIZE);
  const payouts = await db.tenantPayout.findMany({
    where,
    include: { user: { select: { email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Yêu cầu rút tiền từ thành viên</h1>
        <p className="text-muted-foreground">
          Duyệt, chuyển khoản và đối soát yêu cầu rút tiền của thành viên trong Kênh.
        </p>
      </div>
      <Card className="hidden overflow-hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thành viên</TableHead>
              <TableHead>Số tiền</TableHead>
              <TableHead>Phê duyệt</TableHead>
              <TableHead>Thanh toán</TableHead>
              <TableHead>Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map((payout) => (
              <TableRow key={payout.id}>
                <TableCell>{payout.user.email}</TableCell>
                <TableCell>{formatVnd(payout.amountVnd)}</TableCell>
                <TableCell>
                  <Badge>{payout.approvalStatus}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{payout.settlementStatus}</Badge>
                </TableCell>
                <TableCell>
                  <PayoutActions payout={payout} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="space-y-3 md:hidden">
        {payouts.map((payout) => (
          <Card key={payout.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex justify-between">
                <div>
                  <p className="font-medium">{payout.user.email}</p>
                  <p>{formatVnd(payout.amountVnd)}</p>
                </div>
                <div className="space-y-1">
                  <Badge>{payout.approvalStatus}</Badge>
                  <Badge variant="outline">{payout.settlementStatus}</Badge>
                </div>
              </div>
              <PayoutActions payout={payout} />
            </CardContent>
          </Card>
        ))}
      </div>
      <PaginationNav
        currentPage={page}
        totalItems={total}
        pageSize={PAGE_SIZE}
        pathname={`/shop/${tenant.id}/payouts`}
        itemLabel="yêu cầu"
      />
    </div>
  );
}

function PayoutActions({
  payout
}: {
  payout: { id: string; approvalStatus: string; settlementStatus: string; method: string | null };
}) {
  if (payout.approvalStatus === "PENDING")
    return (
      <div className="flex flex-wrap gap-2">
        <form action={tenantApprovePayoutAction} className="flex gap-2">
          <input type="hidden" name="payoutId" value={payout.id} />
          <select name="method" className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="PAYOS">PayOS</option>
            <option value="MANUAL_BANK_TRANSFER">Chuyển khoản thủ công</option>
          </select>
          <Input name="note" placeholder="Ghi chú" className="w-28" />
          <Button size="sm">Duyệt</Button>
        </form>
        <form action={tenantRejectPayoutAction} className="flex gap-2">
          <input type="hidden" name="payoutId" value={payout.id} />
          <Input name="reason" required placeholder="Lý do" className="w-28" />
          <Button size="sm" variant="destructive">
            Từ chối
          </Button>
        </form>
      </div>
    );
  if (payout.method === "MANUAL_BANK_TRANSFER" && payout.settlementStatus === "PROCESSING")
    return (
      <div className="space-y-2">
        <a
          className="text-xs underline"
          href={`/api/v1/tenant/payouts/${payout.id}/beneficiary`}
          target="_blank"
          rel="noreferrer"
        >
          Xem tài khoản nhận
        </a>
        <form action={tenantPayoutOperationAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="payoutId" value={payout.id} />
          <input type="hidden" name="operation" value="manual-complete" />
          <Input name="transferReference" required placeholder="Mã GD" className="w-28" />
          <Input name="evidenceReference" required placeholder="Bằng chứng" className="w-28" />
          <Input name="note" required placeholder="Ghi chú" className="w-28" />
          <Button size="sm">Hoàn tất</Button>
        </form>
        <form action={tenantPayoutOperationAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="payoutId" value={payout.id} />
          <input type="hidden" name="operation" value="manual-unknown" />
          <Input name="evidenceReference" required placeholder="Bằng chứng" className="w-28" />
          <Input name="note" required placeholder="Lý do" className="w-28" />
          <Button size="sm" variant="outline">
            Cần đối soát (UNKNOWN)
          </Button>
        </form>
      </div>
    );
  if (payout.method === "MANUAL_BANK_TRANSFER" && payout.settlementStatus === "UNKNOWN")
    return (
      <form action={tenantPayoutOperationAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="payoutId" value={payout.id} />
        <input type="hidden" name="operation" value="manual-resolve" />
        <select name="resolution" className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="REMAIN_UNKNOWN">Giữ Cần đối soát</option>
          <option value="CONFIRMED_PAID">Đã trả</option>
          <option value="CONFIRMED_NOT_SENT">Chưa gửi</option>
        </select>
        <Input name="evidenceReference" required placeholder="Bằng chứng" className="w-28" />
        <Input name="note" required placeholder="Lý do" className="w-28" />
        <Button size="sm" variant="outline">
          Xác nhận đối soát
        </Button>
      </form>
    );
  const operation =
    payout.method === "PAYOS"
      ? payout.settlementStatus === "NOT_STARTED"
        ? "resume"
        : payout.settlementStatus === "UNKNOWN"
          ? "reconcile"
          : null
      : payout.settlementStatus === "NOT_STARTED"
        ? "manual-start"
        : null;
  return operation ? (
    <form action={tenantPayoutOperationAction}>
      <input type="hidden" name="payoutId" value={payout.id} />
      <input type="hidden" name="operation" value={operation} />
      <Button size="sm" variant="outline">
        {operation}
      </Button>
    </form>
  ) : (
    <span className="text-sm text-muted-foreground">—</span>
  );
}

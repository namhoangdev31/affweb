import { toggleFlagAction, updatePayoutBudgetAction } from "@/app/admin/flags/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

const keys = [
  ["connector.shopee.enabled", "Shopee connector"],
  ["connector.shopee_food.enabled", "ShopeeFood connector"],
  ["connector.shopee_food_cashback", "ShopeeFood cashback release"],
  ["connector.accesstrade.enabled", "AccessTrade connector"],
  ["connector.lazada.enabled", "Lazada connector"],
  ["provider.credentials.enabled", "Provider credential management"],
  ["shopee.orders_import.enabled", "Shopee Orders CSV import"],
  ["cashback.release.enabled", "Cashback release"],
  ["payout.enabled", "payOS payout"],
  ["tenant.finance.enabled", "Tenant finance ledger"],
  ["tenant.topup.enabled", "Tenant treasury top-up"],
  ["tenant.payout_request.enabled", "Tenant payout request"],
  ["tenant.payout_approval.enabled", "Tenant payout approval"],
  ["tenant.treasury_withdrawal.enabled", "Tenant treasury withdrawal"],
  ["tenant.manual_payout.enabled", "Tenant manual payout"],
  ["tenant.auto_payout.enabled", "Tenant PayOS execution"],
  ["tenant.auto_reconciliation.enabled", "Tenant payout reconciliation"],
  ["qstash.recovery.enabled", "QStash finance recovery"],
  ["tenant.zalo_wallet.enabled", "Zalo wallet lookup"],
  ["tenant.zalo_payout.enabled", "Zalo payout confirmation"]
] as const;

export default async function FlagsPage() {
  const existing = await db.featureFlag.findMany({
    where: { key: { in: [...keys.map(([key]) => key), "payout.daily_budget_vnd"] } }
  });
  const map = new Map(existing.map((flag) => [flag.key, flag.enabled]));
  const budgetValue = existing.find((flag) => flag.key === "payout.daily_budget_vnd")?.value;
  const budgetRaw =
    budgetValue &&
    typeof budgetValue === "object" &&
    !Array.isArray(budgetValue) &&
    "amountVnd" in budgetValue
      ? String(budgetValue.amountVnd)
      : "5000000";
  const budgetAmount = /^\d+$/.test(budgetRaw) ? BigInt(budgetRaw) : 5_000_000n;
  return (
    <div>
      <h1 className="display-type text-4xl">Kill switches.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tắt connector không xóa conversion cũ. Tắt release chỉ đóng băng tiền mới.
      </p>
      <div className="mt-8 space-y-3">
        <Card className="hidden overflow-hidden py-0 md:block">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-5">Chức năng</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="pr-5 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map(([key, label]) => {
                const enabled =
                  map.get(key) ??
                  (key === "connector.shopee.enabled" || key === "connector.shopee_food.enabled");
                return (
                  <TableRow key={key}>
                    <TableCell className="pl-5 font-medium">{label}</TableCell>
                    <TableCell className="font-mono text-xs">{key}</TableCell>
                    <TableCell>
                      <Badge variant={enabled ? "default" : "secondary"}>
                        {enabled ? "ON" : "OFF"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <form action={toggleFlagAction}>
                        <input type="hidden" name="key" value={key} />
                        <input type="hidden" name="enabled" value={String(!enabled)} />
                        <Button size="sm" variant="outline" type="submit">
                          {enabled ? "Tắt" : "Bật"}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
        <div className="space-y-3 md:hidden">
          {keys.map(([key, label]) => {
            const enabled =
              map.get(key) ??
              (key === "connector.shopee.enabled" || key === "connector.shopee_food.enabled");
            return (
              <Card key={key}>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex-1">
                    <p className="font-medium">{label}</p>
                    <p className="font-mono text-xs text-muted-foreground">{key}</p>
                  </div>
                  <Badge variant={enabled ? "default" : "secondary"}>
                    {enabled ? "ON" : "OFF"}
                  </Badge>
                  <form action={toggleFlagAction}>
                    <input type="hidden" name="key" value={key} />
                    <input type="hidden" name="enabled" value={String(!enabled)} />
                    <Button size="sm" variant="outline" type="submit">
                      {enabled ? "Tắt" : "Bật"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Card>
          <CardContent className="p-5">
            <p className="font-medium">Ngân sách payout toàn hệ thống / ngày</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Hiện tại: {formatVnd(budgetAmount)}. Ngày được tính theo Asia/Ho_Chi_Minh.
            </p>
            <form action={updatePayoutBudgetAction} className="mt-4 flex max-w-md gap-2">
              <Input
                name="amountVnd"
                type="number"
                min={500000}
                max={1000000000}
                step={1000}
                defaultValue={budgetRaw}
                required
              />
              <Button type="submit" variant="outline">
                Cập nhật
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

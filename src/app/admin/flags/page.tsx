import { toggleFlagAction, updatePayoutBudgetAction } from "@/app/admin/flags/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

const keys = [
  ["connector.shopee.enabled", "Shopee connector"],
  ["connector.shopee_food.enabled", "ShopeeFood connector"],
  ["connector.shopee_food_cashback", "ShopeeFood cashback release"],
  ["connector.accesstrade.enabled", "AccessTrade connector"],
  ["connector.lazada.enabled", "Lazada connector"],
  ["cashback.release.enabled", "Cashback release"],
  ["payout.enabled", "payOS payout"]
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
        {keys.map(([key, label]) => {
          const enabled = map.get(key) ?? false;
          return (
            <Card key={key}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex-1">
                  <p className="font-medium">{label}</p>
                  <p className="font-mono text-xs text-muted-foreground">{key}</p>
                </div>
                <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "ON" : "OFF"}</Badge>
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

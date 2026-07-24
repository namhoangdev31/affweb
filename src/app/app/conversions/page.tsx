import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";

export default async function ConversionsPage() {
  const user = await requireUser();
  const conversions = await db.conversion.findMany({
    where: { userId: user.id },
    include: { merchant: true, items: true },
    orderBy: { purchasedAt: "desc" },
    take: 100
  });
  return (
    <div>
      <p className="text-sm text-muted-foreground">Dữ liệu đối tác đã chuẩn hóa</p>
      <h1 className="display-type mt-1 text-4xl">Đơn hàng & cashback.</h1>
      <div className="mt-8 space-y-4">
        {conversions.map((conversion) => (
          <Card key={conversion.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <div className="grid size-11 place-items-center rounded-xl bg-secondary font-semibold">
                {conversion.merchant.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{conversion.merchant.name}</p>
                  <Badge variant="secondary">{conversion.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {conversion.purchasedAt.toLocaleString("vi-VN")} ·{" "}
                  {conversion.platform.replaceAll("_", " ")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatVnd(conversion.cashbackVnd)}</p>
                <p className="text-xs text-muted-foreground">
                  {conversion.shareBps / 100}% hoa hồng chia lại
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
        {!conversions.length ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            Chưa có conversion.
          </p>
        ) : null}
      </div>
    </div>
  );
}

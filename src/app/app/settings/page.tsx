import { BeneficiaryForm } from "@/components/beneficiary-form";
import { PushToggle } from "@/components/push-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { signOutAllSessionsAction } from "./actions";

export default async function SettingsPage() {
  const user = await requireUser();
  const beneficiary = await db.bankBeneficiary.findFirst({
    where: { userId: user.id, active: true },
    select: { bankBin: true, accountLast4: true }
  });
  const sessions = await db.session.findMany({
    where: { userId: user.id, expires: { gt: new Date() } },
    select: { sessionToken: true, createdAt: true, expires: true },
    orderBy: { createdAt: "desc" }
  });
  return (
    <div>
      <p className="text-sm text-muted-foreground">Bảo mật và thiết bị</p>
      <h1 className="display-type mt-1 text-4xl">Cài đặt.</h1>
      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Người thụ hưởng</CardTitle>
          </CardHeader>
          <CardContent className="max-w-xl">
            <BeneficiaryForm current={beneficiary} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Thông báo</CardTitle>
          </CardHeader>
          <CardContent>
            <PushToggle publicKey={loadServerEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Phiên đăng nhập</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {sessions.length} phiên đang hoạt động. Phiên gần nhất được tạo lúc{" "}
              {sessions[0]?.createdAt.toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh"
              }) ?? "—"}
              .
            </p>
            <form action={signOutAllSessionsAction} className="mt-4">
              <Button type="submit" variant="destructive">
                Đăng xuất tất cả thiết bị
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

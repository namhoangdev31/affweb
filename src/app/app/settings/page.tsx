import type { Route } from "next";
import Link from "next/link";
import { BeneficiaryForm } from "@/components/beneficiary-form";
import { PushToggle } from "@/components/push-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { requestAccountDeletionAction, signOutAllSessionsAction } from "./actions";

export default async function SettingsPage() {
  const user = await requireUser();
  const beneficiary = await db.bankBeneficiary.findFirst({
    where: { userId: user.id, active: true },
    select: { bankBin: true, accountLast4: true }
  });
  const deletionRequest = await db.accountDeletionRequest.findFirst({
    where: { userId: user.id },
    orderBy: { requestedAt: "desc" },
    select: { status: true, blockedReason: true, requestedAt: true }
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
            <CardTitle>Hồ sơ và phiên đăng nhập</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Clerk quản lý email, phương thức đăng nhập, passkey thành viên và danh sách thiết bị.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href={"/app/profile" as Route}>Mở hồ sơ Clerk</Link>
              </Button>
              <form action={signOutAllSessionsAction}>
                <Button type="submit" variant="destructive">
                  Đăng xuất tất cả thiết bị
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Đóng tài khoản</CardTitle>
          </CardHeader>
          <CardContent className="max-w-xl">
            {deletionRequest ? (
              <div className="text-sm">
                <p>
                  Yêu cầu gần nhất: <strong>{deletionRequest.status}</strong> —{" "}
                  {deletionRequest.requestedAt.toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh"
                  })}
                </p>
                {deletionRequest.blockedReason ? (
                  <p className="mt-2 text-destructive">{deletionRequest.blockedReason}</p>
                ) : null}
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Yêu cầu chỉ được thực hiện khi ví, conversion và payout đã hoàn tất. Ledger và
                  chứng từ tài chính vẫn được giữ theo thời hạn bắt buộc.
                </p>
                <form action={requestAccountDeletionAction} className="mt-4 space-y-3">
                  <Input name="reason" maxLength={500} placeholder="Lý do (không bắt buộc)" />
                  <Button type="submit" variant="destructive">
                    Gửi yêu cầu đóng tài khoản
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { BeneficiaryForm } from "@/components/beneficiary-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { requireTenantUserContext } from "@/modules/tenants/persona";

export default async function TenantUserSettingsPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const context = await requireTenantUserContext(user.id, slug);
  const beneficiary = await db.bankBeneficiary.findFirst({
    where: { userId: user.id, active: true },
    orderBy: { createdAt: "desc" }
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cài đặt nhận tiền</h1>
        <p className="text-muted-foreground">
          Kênh {context.memberTenant!.name} không thể xem dữ liệu plaintext này.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tài khoản ngân hàng</CardTitle>
          <CardDescription>
            Thông tin được mã hóa; thay đổi sẽ áp dụng thời gian bảo vệ payout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BeneficiaryForm current={beneficiary} />
        </CardContent>
      </Card>
    </div>
  );
}

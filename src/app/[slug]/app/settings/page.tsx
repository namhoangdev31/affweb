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
          Thông tin cá nhân của bạn được bảo mật tuyệt đối và ẩn số tài khoản với Kênh{" "}
          {context.memberTenant!.name}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tài khoản ngân hàng</CardTitle>
          <CardDescription>
            Thông tin tài khoản được mã hóa an toàn; thay đổi thông tin sẽ áp dụng thời gian bảo vệ
            để bảo đảm an toàn cho số dư của bạn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BeneficiaryForm current={beneficiary} />
        </CardContent>
      </Card>
    </div>
  );
}

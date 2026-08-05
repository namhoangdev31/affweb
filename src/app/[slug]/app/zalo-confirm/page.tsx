import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { requireTenantUserContext } from "@/modules/tenants/persona";
import { consumeZaloFinancialGrantAction } from "./actions";

export default async function ZaloConfirmPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ grant?: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  await requireTenantUserContext(user.id, slug);
  const { grant } = await searchParams;
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Xác nhận thao tác từ Zalo</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Link chỉ dùng một lần và không tự tạo payout. Sau xác nhận, bạn vẫn phải kiểm tra số tiền
          và gửi yêu cầu trong portal.
        </p>
        <form action={consumeZaloFinancialGrantAction} className="mt-5">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="grant" value={grant ?? ""} />
          <Button type="submit" disabled={!grant}>
            Xác nhận và tiếp tục
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

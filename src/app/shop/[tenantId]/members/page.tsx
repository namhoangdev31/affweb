import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const PAGE_SIZE = 20;

function formatMemberStatus(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: "Hoạt động",
    SUSPENDED: "Tạm dừng",
    INACTIVE: "Chưa kích hoạt"
  };
  return map[status] ?? status;
}

export default async function ShopTenantMembersPage({
  params,
  searchParams
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { tenantId: paramId } = await params;
  const user = await requireUser();
  const query = await searchParams;
  const tenant = await db.tenant.findFirst({
    where: { OR: [{ id: paramId }, { slug: paramId.toLowerCase() }] }
  });
  const context = await requireTenantMasterContext(user.id, tenant?.id);
  const where = { tenantId: context.ownedTenant!.id };
  const total = await db.user.count({ where });
  const currentPage = paginationPage(query.page, total, PAGE_SIZE);
  const members = await db.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      tenantMemberWallets: {
        where: { tenantId: context.ownedTenant!.id },
        select: {
          pendingFundingVnd: true,
          availableVnd: true,
          reservedVnd: true,
          paidVnd: true
        }
      },
      beneficiaries: {
        where: { active: true },
        select: { bankBin: true, accountLast4: true, status: true },
        take: 1
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Thành viên</h1>
        <p className="text-muted-foreground">
          Thông tin ngân hàng của thành viên luôn được bảo mật và ẩn số tài khoản.
        </p>
      </div>
      <Card className="hidden overflow-hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thành viên</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Khả dụng</TableHead>
              <TableHead className="text-right">Chờ vốn</TableHead>
              <TableHead className="text-right">Đã trả</TableHead>
              <TableHead>Tài khoản nhận</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const wallet = member.tenantMemberWallets[0];
              const beneficiary = member.beneficiaries[0];
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <p>{member.name ?? "Thành viên"}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </TableCell>
                  <TableCell>{formatMemberStatus(member.status)}</TableCell>
                  <TableCell className="text-right">
                    {formatVnd(wallet?.availableVnd ?? 0n)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatVnd(wallet?.pendingFundingVnd ?? 0n)}
                  </TableCell>
                  <TableCell className="text-right">{formatVnd(wallet?.paidVnd ?? 0n)}</TableCell>
                  <TableCell>
                    {beneficiary
                      ? `${beneficiary.bankBin} ••••${beneficiary.accountLast4}`
                      : "Chưa cấu hình"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <div className="grid gap-4 md:hidden">
        {members.map((member) => {
          const wallet = member.tenantMemberWallets[0];
          const beneficiary = member.beneficiaries[0];
          return (
            <Card key={member.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {member.name ?? member.email ?? "Thành viên"}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm md:grid-cols-4">
                <span>Khả dụng: {formatVnd(wallet?.availableVnd ?? 0n)}</span>
                <span>Chờ vốn: {formatVnd(wallet?.pendingFundingVnd ?? 0n)}</span>
                <span>Đã trả: {formatVnd(wallet?.paidVnd ?? 0n)}</span>
                <span>
                  Tài khoản:{" "}
                  {beneficiary
                    ? `${beneficiary.bankBin} ••••${beneficiary.accountLast4}`
                    : "Chưa cấu hình"}
                </span>
              </CardContent>
            </Card>
          );
        })}
        {!members.length ? (
          <p className="text-muted-foreground">Kênh Săn Sale chưa có thành viên.</p>
        ) : null}
      </div>
      <PaginationNav
        currentPage={currentPage}
        totalItems={total}
        pageSize={PAGE_SIZE}
        pathname={`/shop/${context.ownedTenant!.id}/members`}
        itemLabel="thành viên"
      />
    </div>
  );
}

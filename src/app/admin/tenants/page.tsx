import { Role, TenantStatus } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { getAppHostDisplay } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AdminPasskey } from "@/components/admin-passkey";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  adjustTenantPlanAdminAction,
  changeTenantStatusAdminAction,
  createTenantAdminAction,
  updateTenantAdminAction
} from "./actions";

const PAGE_SIZE = 25;

function money(value: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(value)} ₫`;
}

export default async function AdminTenantsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireRole([Role.SUPER_ADMIN]);
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 120) ?? "";
  const status = Object.values(TenantStatus).includes(params.status as TenantStatus)
    ? (params.status as TenantStatus)
    : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const effectiveNow = new Date();
  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
            { owner: { email: { contains: q, mode: "insensitive" as const } } }
          ]
        }
      : {})
  };

  const [
    tenants,
    filteredTotal,
    totalCount,
    activeCount,
    trialCount,
    pastDueCount,
    suspendedCount,
    monthlyRevenue,
    ownerCandidates,
    plans
  ] = await Promise.all([
    db.tenant.findMany({
      where,
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { users: true, clicks: true, conversions: true } },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            id: true,
            planCode: true,
            status: true,
            amountVnd: true,
            createdAt: true,
            paidAt: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    db.tenant.count({ where }),
    db.tenant.count(),
    db.tenant.count({ where: { status: "ACTIVE", planExpiresAt: { gt: effectiveNow } } }),
    db.tenant.count({ where: { status: "TRIAL", planExpiresAt: { gt: effectiveNow } } }),
    db.tenant.count({
      where: {
        OR: [
          { status: "PAST_DUE" },
          { status: { in: ["TRIAL", "ACTIVE"] }, planExpiresAt: { lte: effectiveNow } }
        ]
      }
    }),
    db.tenant.count({ where: { status: "SUSPENDED" } }),
    db.saaSInvoice.aggregate({
      where: { status: "PAID", paidAt: { gte: startOfMonth } },
      _sum: { amountVnd: true }
    }),
    db.user.findMany({
      where: {
        status: "ACTIVE",
        emailVerified: { not: null },
        ownedTenant: null
      },
      select: { id: true, email: true, name: true },
      orderBy: { email: "asc" },
      take: 100
    }),
    db.subscriptionPlan.findMany({
      where: { active: true, billingCycle: { in: ["MONTHLY", "YEARLY"] } },
      select: { code: true, name: true, durationDays: true },
      orderBy: { priceVnd: "asc" }
    })
  ]);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Quản lý Tenants</h1>
        <p className="text-muted-foreground">
          Dữ liệu PostgreSQL thật. Mọi mutation yêu cầu fresh admin session, passkey và lý do.
        </p>
      </div>
      <AdminPasskey />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tổng tenant</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totalCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{activeCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Trial</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{trialCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Past due</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{pastDueCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Suspended</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{suspendedCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">PayOS tháng này</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {money(monthlyRevenue._sum.amountVnd ?? 0n)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tạo tenant dùng thử</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTenantAdminAction} className="grid gap-3 md:grid-cols-3">
            <select
              name="ownerUserId"
              required
              className="h-10 rounded-md border bg-background px-3"
            >
              <option value="">Chọn owner đã verified</option>
              {ownerCandidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email ?? user.name ?? user.id}
                </option>
              ))}
            </select>
            <Input name="name" required placeholder="Tên tenant" />
            <Input name="slug" required placeholder="slug-tenant" />
            <Input name="shopeeAffiliateId" required placeholder="Shopee Affiliate ID" />
            <Input
              name="memberShareBps"
              required
              type="number"
              min="100"
              max="10000"
              placeholder="Share bps"
            />
            <Input name="reason" required minLength={12} placeholder="Lý do tạo tenant" />
            <Button type="submit" className="md:col-span-3">
              Tạo tenant
            </Button>
          </form>
        </CardContent>
      </Card>

      <form className="flex flex-wrap gap-3">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Tên, slug hoặc owner email"
          className="max-w-sm"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-10 rounded-md border bg-background px-3"
        >
          <option value="">Mọi trạng thái</option>
          {Object.values(TenantStatus).map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <Button type="submit">Lọc</Button>
      </form>

      <div className="space-y-4">
        {tenants.map((tenant) => (
          <Card key={tenant.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                {tenant.name}
                <Badge>{tenant.status}</Badge>
                <Badge variant="outline">{tenant.planCode ?? tenant.planId}</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {tenant.slug}.{getAppHostDisplay()} · {tenant.owner?.email ?? "Chưa có owner"} · hết
                hạn {tenant.planExpiresAt.toLocaleDateString("vi-VN")}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2 text-sm md:grid-cols-4">
                <span>{tenant._count.users} thành viên</span>
                <span>{tenant._count.clicks} click</span>
                <span>{tenant._count.conversions} conversion</span>
                <span>{tenant.invoices.length} invoice gần nhất</span>
              </div>

              <details>
                <summary className="cursor-pointer font-medium">Cấu hình và thao tác</summary>
                <div className="mt-4 space-y-4">
                  <form action={updateTenantAdminAction} className="grid gap-3 md:grid-cols-4">
                    <input type="hidden" name="tenantId" value={tenant.id} />
                    <Input name="name" defaultValue={tenant.name} required />
                    <Input
                      name="brandColor"
                      type="color"
                      defaultValue={tenant.brandColor ?? "#173b31"}
                      required
                    />
                    <Input
                      name="shopeeAffiliateId"
                      defaultValue={tenant.shopeeAffiliateId ?? ""}
                      required
                    />
                    <Input
                      name="memberShareBps"
                      type="number"
                      min="100"
                      max="10000"
                      defaultValue={tenant.memberShareBps ?? 5000}
                      required
                    />
                    <Input name="reason" minLength={12} placeholder="Lý do chỉnh sửa" required />
                    <Button type="submit" variant="outline" className="md:col-span-4">
                      Lưu cấu hình
                    </Button>
                  </form>

                  <form action={adjustTenantPlanAdminAction} className="grid gap-3 md:grid-cols-4">
                    <input type="hidden" name="tenantId" value={tenant.id} />
                    <select
                      name="planCode"
                      required
                      className="h-10 rounded-md border bg-background px-3"
                    >
                      {plans.map((plan) => (
                        <option key={plan.code} value={plan.code}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      name="extensionDays"
                      type="number"
                      min="1"
                      max="3650"
                      defaultValue="30"
                      required
                    />
                    <Input
                      name="reason"
                      minLength={12}
                      placeholder="Lý do đổi/gia hạn plan"
                      required
                    />
                    <Button type="submit">Áp dụng plan adjustment</Button>
                  </form>

                  <div className="grid gap-3 md:grid-cols-3">
                    {(["SUSPEND", "RESTORE", "CLOSE"] as const).map((action) => (
                      <form
                        key={action}
                        action={changeTenantStatusAdminAction}
                        className="space-y-2"
                      >
                        <input type="hidden" name="tenantId" value={tenant.id} />
                        <input type="hidden" name="action" value={action} />
                        <Input
                          name="reason"
                          minLength={12}
                          placeholder={`Lý do ${action.toLowerCase()}`}
                          required
                        />
                        <Button
                          type="submit"
                          variant={action === "CLOSE" ? "destructive" : "outline"}
                          className="w-full"
                        >
                          {action}
                        </Button>
                      </form>
                    ))}
                  </div>
                </div>
              </details>

              <div className="space-y-1 text-xs text-muted-foreground">
                {tenant.invoices.map((invoice) => (
                  <div key={invoice.id}>
                    {invoice.planCode} · {invoice.status} · {money(invoice.amountVnd ?? 0n)} ·{" "}
                    {invoice.createdAt.toLocaleDateString("vi-VN")}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {tenants.length === 0 && <p className="text-muted-foreground">Không có tenant phù hợp.</p>}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>
          Trang {page} / {Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <a href={`?q=${encodeURIComponent(q)}&status=${status ?? ""}&page=${page - 1}`}>
              Trang trước
            </a>
          )}
          {page * PAGE_SIZE < filteredTotal && (
            <a href={`?q=${encodeURIComponent(q)}&status=${status ?? ""}&page=${page + 1}`}>
              Trang sau
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

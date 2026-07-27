"use client";

import { useState } from "react";
import {
  Building2,
  Calendar,
  Crown,
  DollarSign,
  Plus,
  Search
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  customDomain?: string;
  planId: string;
  status: string;
  isTrial: boolean;
  userCount: number;
  expiresAt: string;
  revenueVnd: number;
}

export default function SaaSAdminTenantsPage() {
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [creating, setCreating] = useState(false);

  const [tenants, setTenants] = useState<TenantItem[]>([
    {
      id: "t-1",
      name: "Săn Sale KOC VIP",
      slug: "sansale-koc",
      customDomain: "aff.sansale.vn",
      planId: "PRO_199K",
      status: "ACTIVE",
      isTrial: false,
      userCount: 1420,
      expiresAt: "2026-08-25",
      revenueVnd: 199000
    },
    {
      id: "t-2",
      name: "Ghiền Shopping Channel",
      slug: "ghien-shopping",
      planId: "STARTER_99K",
      status: "ACTIVE",
      isTrial: false,
      userCount: 310,
      expiresAt: "2026-08-12",
      revenueVnd: 99000
    },
    {
      id: "t-3",
      name: "KOL Tech Review",
      slug: "kol-tech",
      planId: "TRIAL_14D",
      status: "TRIAL",
      isTrial: true,
      userCount: 45,
      expiresAt: "2026-08-07",
      revenueVnd: 0
    },
    {
      id: "t-4",
      name: "Deal Hot Mỗi Ngày",
      slug: "dealhot247",
      customDomain: "aff.dealhot247.com",
      planId: "PREMIUM_399K",
      status: "ACTIVE",
      isTrial: false,
      userCount: 8900,
      expiresAt: "2026-09-01",
      revenueVnd: 399000
    }
  ]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName || !newTenantSlug) return;
    setCreating(true);
    try {
      const res = await fetch("/api/saas/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTenantName,
          slug: newTenantSlug
        })
      });
      const data = await res.json();
      if (data.success && data.tenant) {
        const expiresAtStr = data.tenant.planExpiresAt
          ? new Date(data.tenant.planExpiresAt).toISOString().split("T")[0] || ""
          : "";

        setTenants((prev) => [
          ...prev,
          {
            id: data.tenant.id,
            name: data.tenant.name,
            slug: data.tenant.slug,
            planId: "TRIAL_14D",
            status: "TRIAL",
            isTrial: true,
            userCount: 1,
            expiresAt: expiresAtStr,
            revenueVnd: 0
          }
        ]);
        setNewTenantName("");
        setNewTenantSlug("");
        setShowCreateModal(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = tenants.reduce((acc, t) => acc + t.revenueVnd, 0);
  const activeTenants = tenants.filter((t) => t.status === "ACTIVE").length;
  const trialTenants = tenants.filter((t) => t.isTrial).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-10">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý SaaS Tenants & Doanh thu PayOS</h1>
          <p className="text-muted-foreground">
            Quản lý các chủ sở hữu hệ thống con, gói cước (99k, 199k, 399k) và theo dõi doanh thu thanh toán tự động.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="rounded-full gap-2">
          <Plus className="size-4" /> Tạo Tenant Dùng thử (14 Ngày)
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Doanh thu SaaS (Tháng)</CardTitle>
            <DollarSign className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{totalRevenue.toLocaleString("vi-VN")} ₫</div>
            <p className="text-xs text-muted-foreground">Tự động thu qua PayOS VietQR</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tổng số Tenant</CardTitle>
            <Building2 className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.length}</div>
            <p className="text-xs text-muted-foreground">Không gian làm việc đã khởi tạo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Đang trả phí (Active)</CardTitle>
            <Crown className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{activeTenants}</div>
            <p className="text-xs text-muted-foreground">Gói 99k / 199k / 399k</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Đang dùng thử (14D)</CardTitle>
            <Calendar className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{trialTenants}</div>
            <p className="text-xs text-muted-foreground">Miễn phí 14 ngày dùng thử</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Create Modal */}
      {showCreateModal && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>Khởi tạo Tenant Mới (Dùng thử 14 Ngày)</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTenant} className="space-y-4 max-w-md">
              <div>
                <label className="text-sm font-medium">Tên Hệ thống / Thương hiệu</label>
                <Input
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  placeholder="Ví dụ: Săn Sale Mẹ Bỉm"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Slug Tên miền con (`slug.affweb.vn`)</label>
                <Input
                  value={newTenantSlug}
                  onChange={(e) => setNewTenantSlug(e.target.value)}
                  placeholder="san-sale-me-bim"
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={creating} className="rounded-full">
                  {creating ? "Đang tạo..." : "Xác nhận tạo Tenant"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} className="rounded-full">
                  Hủy
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tenant List Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Danh sách Tenants Hệ thống</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên hoặc slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-full"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên Thương Hiệu / Subdomain</TableHead>
                <TableHead>Gói Cước</TableHead>
                <TableHead>Trạng Thái</TableHead>
                <TableHead>Thành Viên</TableHead>
                <TableHead>Ngày Hết Hạn</TableHead>
                <TableHead>Doanh Thu SaaS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <div>{t.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {t.slug}.affweb.vn {t.customDomain && `(${t.customDomain})`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.isTrial ? "outline" : "default"} className="font-mono">
                      {t.planId}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {t.status === "ACTIVE" ? (
                      <Badge className="bg-emerald-600">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-500/20 text-amber-800">
                        14-Day Trial
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{t.userCount.toLocaleString()} người</TableCell>
                  <TableCell>{t.expiresAt}</TableCell>
                  <TableCell className="font-bold text-emerald-600">
                    {t.revenueVnd > 0 ? `${t.revenueVnd.toLocaleString("vi-VN")} ₫` : "0 ₫ (Free Trial)"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

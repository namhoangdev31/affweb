import { ConnectorMode, ConnectorType, Platform } from "@/generated/prisma/client";
import {
  upsertAffiliateAccountAction,
  upsertCampaignAction,
  upsertMerchantAction
} from "@/app/admin/catalog/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";

const selectClass = "mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm";

export default async function CatalogPage() {
  const [merchants, campaigns, accounts] = await Promise.all([
    db.merchant.findMany({ orderBy: [{ platform: "asc" }, { name: "asc" }] }),
    db.campaign.findMany({
      include: { merchant: { select: { name: true } } },
      orderBy: { createdAt: "desc" }
    }),
    db.affiliateAccount.findMany({
      include: { connectorConfigs: true },
      orderBy: { createdAt: "desc" }
    })
  ]);
  return (
    <div>
      <h1 className="display-type text-4xl">Đối tác & campaign.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Chỉ lưu ID công khai và policy. API key/token luôn nằm trong environment.
      </p>
      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Merchant</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={upsertMerchantAction} className="space-y-4">
              <div>
                <Label htmlFor="platform">Platform</Label>
                <select id="platform" name="platform" className={selectClass}>
                  {Object.values(Platform).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="code">Code ổn định</Label>
                <Input id="code" name="code" required />
              </div>
              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" name="slug" required />
              </div>
              <div>
                <Label htmlFor="name">Tên</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="description">Mô tả</Label>
                <Input id="description" name="description" />
              </div>
              <div>
                <Label htmlFor="defaultShareBps">Tỷ lệ mặc định (bps)</Label>
                <Input
                  id="defaultShareBps"
                  name="defaultShareBps"
                  type="number"
                  min="0"
                  max="10000"
                  defaultValue="5000"
                  required
                />
              </div>
              <Button type="submit">Lưu merchant</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={upsertCampaignAction} className="space-y-4">
              <div>
                <Label htmlFor="merchantId">Merchant</Label>
                <select id="merchantId" name="merchantId" className={selectClass} required>
                  {merchants.map((merchant) => (
                    <option key={merchant.id} value={merchant.id}>
                      {merchant.name} · {merchant.platform}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="externalId">External campaign ID</Label>
                <Input id="externalId" name="externalId" required />
              </div>
              <div>
                <Label htmlFor="campaignSlug">Slug</Label>
                <Input id="campaignSlug" name="slug" required />
              </div>
              <div>
                <Label htmlFor="campaignName">Tên</Label>
                <Input id="campaignName" name="name" required />
              </div>
              <div>
                <Label htmlFor="allowedHosts">Allowed hosts</Label>
                <Input
                  id="allowedHosts"
                  name="allowedHosts"
                  placeholder="example.vn, shop.example.vn"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Phân cách bằng dấu phẩy; chống open redirect/SSRF.
                </p>
              </div>
              <Button type="submit">Lưu campaign</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Affiliate account</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={upsertAffiliateAccountAction} className="space-y-4">
              <div>
                <Label htmlFor="connectorType">Connector</Label>
                <select id="connectorType" name="connectorType" className={selectClass}>
                  {Object.values(ConnectorType).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="accountPlatform">Platform</Label>
                <select id="accountPlatform" name="platform" className={selectClass}>
                  {Object.values(Platform).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="externalAccountId">External account ID</Label>
                <Input id="externalAccountId" name="externalAccountId" required />
              </div>
              <div>
                <Label htmlFor="label">Nhãn</Label>
                <Input id="label" name="label" required />
              </div>
              <div>
                <Label htmlFor="mode">Mode</Label>
                <select id="mode" name="mode" className={selectClass}>
                  {Object.values(ConnectorMode).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="enabled">Trạng thái</Label>
                <select id="enabled" name="enabled" className={selectClass}>
                  <option value="false">Disabled</option>
                  <option value="true">Enabled</option>
                </select>
              </div>
              <Button type="submit">Lưu account</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Merchants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {merchants.map((merchant) => (
              <div key={merchant.id} className="rounded-xl border p-3">
                <div className="flex justify-between gap-2">
                  <p className="font-medium">{merchant.name}</p>
                  <Badge>{merchant.platform}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {merchant.code} · {merchant.defaultShareBps / 100}%
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="rounded-xl border p-3">
                <p className="font-medium">{campaign.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {campaign.merchant.name} · {campaign.externalId ?? "No external ID"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-xl border p-3">
                <div className="flex justify-between gap-2">
                  <p className="font-medium">{account.label}</p>
                  <Badge variant={account.enabled ? "default" : "secondary"}>
                    {account.connectorConfigs[0]?.mode ?? "UNCONFIGURED"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {account.connectorType} · {account.platform}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { RuleScope } from "@/generated/prisma/client";
import { createRuleAction } from "@/app/admin/rules/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";

export default async function RulesPage() {
  const [rules, users, merchants, campaigns] = await Promise.all([
    db.commissionRule.findMany({
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" }
    }),
    db.user.findMany({ select: { id: true, email: true }, take: 100 }),
    db.merchant.findMany({ select: { id: true, name: true } }),
    db.campaign.findMany({ select: { id: true, name: true }, take: 100 })
  ]);
  return (
    <div>
      <h1 className="display-type text-4xl">Tỷ lệ chia.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Version cũ không bị sửa; click luôn giữ snapshot ban đầu.
      </p>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="flex items-center gap-4 p-5">
                <Badge>{rule.scope}</Badge>
                <div className="flex-1 text-sm text-muted-foreground">
                  {rule.userId ?? "—"} · {rule.merchantId ?? "—"} · {rule.campaignId ?? "—"}
                </div>
                <p className="font-semibold">{(rule.versions[0]?.shareBps ?? 0) / 100}%</p>
                <p className="text-xs">v{rule.versions[0]?.version ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Tạo version mới</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createRuleAction} className="space-y-4">
              <div>
                <Label htmlFor="scope">Scope</Label>
                <select
                  id="scope"
                  name="scope"
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {Object.values(RuleScope).map((scope) => (
                    <option key={scope}>{scope}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="shareBps">Basis points</Label>
                <Input id="shareBps" name="shareBps" type="number" min="0" max="10000" required />
              </div>
              <div>
                <Label htmlFor="userId">User (tùy scope)</Label>
                <select
                  id="userId"
                  name="userId"
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {users.map((user) => (
                    <option value={user.id} key={user.id}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="merchantId">Merchant</Label>
                <select
                  id="merchantId"
                  name="merchantId"
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {merchants.map((merchant) => (
                    <option value={merchant.id} key={merchant.id}>
                      {merchant.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="campaignId">Campaign</Label>
                <select
                  id="campaignId"
                  name="campaignId"
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {campaigns.map((campaign) => (
                    <option value={campaign.id} key={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="reason">Lý do</Label>
                <Input id="reason" name="reason" minLength={8} required />
              </div>
              <Button type="submit">Tạo version</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

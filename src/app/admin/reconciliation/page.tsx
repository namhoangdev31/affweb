import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { importConversionsCsvAction, resolveReconciliationAction } from "./actions";

export default async function ReconciliationPage() {
  const [cases, runs, evidence, accounts] = await Promise.all([
    db.reconciliationCase.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.syncRun.findMany({
      include: { connectorConfig: true },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    db.rawEvidence.findMany({ orderBy: { capturedAt: "desc" }, take: 50 }),
    db.affiliateAccount.findMany({
      where: { enabled: true },
      orderBy: [{ platform: "asc" }, { label: "asc" }]
    })
  ]);

  return (
    <div>
      <p className="text-sm text-muted-foreground">Nguồn dữ liệu, sai lệch và bằng chứng</p>
      <h1 className="display-type mt-1 text-4xl">Đối soát.</h1>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Import conversion CSV</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={importConversionsCsvAction}
            className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]"
          >
            <select
              required
              name="affiliateAccountId"
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Chọn affiliate account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.platform} · {account.label}
                </option>
              ))}
            </select>
            <Input required type="file" name="file" accept=".csv,text/csv" />
            <Button type="submit">Import có passkey</Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Cột bắt buộc: externalOrderId, externalItemKey, purchasedAt ISO, grossCommissionVnd,
            netCommissionVnd, status, externalItemId, quantity, commissionVnd. Tùy chọn: clickToken,
            itemName, priceVnd. Tối đa 2 MB / 250 dòng mỗi batch.
          </p>
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Cases</h2>
        <div className="mt-3 space-y-3">
          {cases.map((item) => (
            <Card key={item.id}>
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={item.status === "OPEN" ? "destructive" : "secondary"}>
                      {item.status}
                    </Badge>
                    <Badge variant="outline">{item.severity}</Badge>
                    <Badge variant="outline">{item.platform}</Badge>
                  </div>
                  <p className="mt-3 font-medium">{item.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Order {item.externalOrderId ?? "—"} ·{" "}
                    {item.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                  </p>
                  {item.resolution ? (
                    <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{item.resolution}</p>
                  ) : null}
                </div>
                {item.status === "OPEN" ? (
                  <form action={resolveReconciliationAction} className="grid min-w-72 gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <select
                      name="status"
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="MATCHED">MATCHED</option>
                      <option value="ADJUSTED">ADJUSTED</option>
                      <option value="DISMISSED">DISMISSED</option>
                    </select>
                    <Input
                      name="resolution"
                      required
                      minLength={12}
                      placeholder="Kết quả điều tra và bằng chứng"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Đóng case
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {!cases.length ? (
            <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
              Không có case đối soát.
            </p>
          ) : null}
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sync runs gần nhất</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {runs.map((run) => (
              <div key={run.id} className="grid grid-cols-[1fr_auto] gap-3 border-b pb-3 text-sm">
                <div>
                  <p className="font-medium">
                    {run.connectorConfig.platform} · {run.kind}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {run.acceptedCount}/{run.receivedCount} accepted · {run.rejectedCount} rejected
                  </p>
                </div>
                <Badge variant={run.status === "FAILED" ? "destructive" : "secondary"}>
                  {run.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Raw evidence gần nhất</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {evidence.map((item) => (
              <div key={item.id} className="border-b pb-3 text-sm">
                <p className="font-medium">
                  {item.provider} · {item.kind}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                  {item.objectKey}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  sha256:{item.sha256.slice(0, 20)}…
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationNav } from "@/components/pagination-nav";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { paginationPage } from "@/lib/pagination";
import { importConversionsCsvAction, resolveReconciliationAction } from "./actions";

const PAGE_SIZE = 20;
const PANEL_PAGE_SIZE = 10;

export default async function ReconciliationPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; runPage?: string; evidencePage?: string }>;
}) {
  const params = await searchParams;
  const [totalCases, totalRuns, totalEvidence, accounts] = await Promise.all([
    db.reconciliationCase.count(),
    db.syncRun.count(),
    db.rawEvidence.count(),
    db.affiliateAccount.findMany({
      where: { enabled: true },
      orderBy: [{ platform: "asc" }, { label: "asc" }]
    })
  ]);
  const currentPage = paginationPage(params.page, totalCases, PAGE_SIZE);
  const runPage = paginationPage(params.runPage, totalRuns, PANEL_PAGE_SIZE);
  const evidencePage = paginationPage(params.evidencePage, totalEvidence, PANEL_PAGE_SIZE);
  const [cases, runs, evidence] = await Promise.all([
    db.reconciliationCase.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    db.syncRun.findMany({
      include: { connectorConfig: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (runPage - 1) * PANEL_PAGE_SIZE,
      take: PANEL_PAGE_SIZE
    }),
    db.rawEvidence.findMany({
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
      skip: (evidencePage - 1) * PANEL_PAGE_SIZE,
      take: PANEL_PAGE_SIZE
    })
  ]);

  return (
    <div>
      <p className="text-sm text-muted-foreground">Nguồn dữ liệu, sai lệch và bằng chứng</p>
      <h1 className="display-type mt-1 text-4xl">Đối soát.</h1>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Nhập danh sách đơn hàng từ file CSV</CardTitle>
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
              <option value="">Chọn tài khoản Affiliate</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.platform} · {account.label}
                </option>
              ))}
            </select>
            <Input required type="file" name="file" accept=".csv,text/csv" />
            <Button type="submit">Nhập dữ liệu (Yêu cầu chìa khóa)</Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Cột bắt buộc: externalOrderId, externalItemKey, purchasedAt ISO, grossCommissionVnd,
            netCommissionVnd, status, externalItemId, quantity, commissionVnd. Tùy chọn: clickToken,
            itemName, priceVnd. Tối đa 2 MB / 250 dòng mỗi batch.
          </p>
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Vấn đề sai lệch đối soát</h2>
        <div className="mt-3 space-y-3">
          <Card className="hidden overflow-hidden py-0 lg:block">
            <Table className="min-w-[1000px]">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-5">Trạng thái</TableHead>
                  <TableHead>Platform / Severity</TableHead>
                  <TableHead>Đơn hàng</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead className="pr-5">Xử lý</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="pl-5">
                      <Badge variant={item.status === "OPEN" ? "destructive" : "secondary"}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.platform}
                      <p className="text-xs text-muted-foreground">{item.severity}</p>
                    </TableCell>
                    <TableCell>{item.externalOrderId ?? "—"}</TableCell>
                    <TableCell className="max-w-sm whitespace-normal">
                      {item.reason}
                      <p className="text-xs text-muted-foreground">
                        {item.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                      </p>
                    </TableCell>
                    <TableCell className="pr-5">
                      {item.status === "OPEN" ? (
                        <form action={resolveReconciliationAction} className="grid min-w-64 gap-2">
                          <input type="hidden" name="id" value={item.id} />
                          <select
                            name="status"
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                          >
                            <option value="MATCHED">Đã khớp (MATCHED)</option>
                            <option value="ADJUSTED">Đã điều chỉnh (ADJUSTED)</option>
                            <option value="DISMISSED">Bỏ qua (DISMISSED)</option>
                          </select>
                          <Input
                            name="resolution"
                            required
                            minLength={12}
                            placeholder="Kết quả điều tra"
                          />
                          <Button type="submit" size="sm" variant="outline">
                            Đóng vấn đề
                          </Button>
                        </form>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="space-y-3 lg:hidden">
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
                        <option value="MATCHED">Đã khớp (MATCHED)</option>
                        <option value="ADJUSTED">Đã điều chỉnh (ADJUSTED)</option>
                        <option value="DISMISSED">Bỏ qua (DISMISSED)</option>
                      </select>
                      <Input
                        name="resolution"
                        required
                        minLength={12}
                        placeholder="Kết quả điều tra và bằng chứng"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Đóng vấn đề
                      </Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
          {!cases.length ? (
            <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
              Không có vấn đề sai lệch đối soát nào.
            </p>
          ) : (
            <PaginationNav
              currentPage={currentPage}
              totalItems={totalCases}
              pageSize={PAGE_SIZE}
              pathname="/admin/reconciliation"
              itemLabel="vấn đề"
            />
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lượt đồng bộ gần đây</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Connector / Kind</TableHead>
                    <TableHead>Kết quả</TableHead>
                    <TableHead className="text-right">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        {run.connectorConfig.platform} · {run.kind}
                      </TableCell>
                      <TableCell>
                        {run.acceptedCount}/{run.receivedCount} accepted · {run.rejectedCount}{" "}
                        rejected
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={run.status === "FAILED" ? "destructive" : "secondary"}>
                          {run.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {runs.map((run) => (
                <div key={run.id} className="grid grid-cols-[1fr_auto] gap-3 border-b pb-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {run.connectorConfig.platform} · {run.kind}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.acceptedCount}/{run.receivedCount} accepted · {run.rejectedCount}{" "}
                      rejected
                    </p>
                  </div>
                  <Badge variant={run.status === "FAILED" ? "destructive" : "secondary"}>
                    {run.status}
                  </Badge>
                </div>
              ))}
            </div>
            {runs.length ? (
              <PaginationNav
                currentPage={runPage}
                totalItems={totalRuns}
                pageSize={PANEL_PAGE_SIZE}
                pathname="/admin/reconciliation"
                query={{ page: params.page, evidencePage: params.evidencePage }}
                pageParam="runPage"
                itemLabel="lượt đồng bộ"
              />
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bằng chứng dữ liệu đối soát</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider / Kind</TableHead>
                    <TableHead>Object key</TableHead>
                    <TableHead>SHA-256</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidence.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.provider} · {item.kind}
                      </TableCell>
                      <TableCell className="max-w-xs truncate font-mono text-xs">
                        {item.objectKey}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.sha256.slice(0, 20)}…
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
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
            </div>
            {evidence.length ? (
              <PaginationNav
                currentPage={evidencePage}
                totalItems={totalEvidence}
                pageSize={PANEL_PAGE_SIZE}
                pathname="/admin/reconciliation"
                query={{ page: params.page, runPage: params.runPage }}
                pageParam="evidencePage"
                itemLabel="bằng chứng"
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

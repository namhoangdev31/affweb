import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";

export default async function ConnectorsPage() {
  const configs = await db.connectorConfig.findMany({
    include: { health: true, affiliateAccount: true },
    orderBy: { platform: "asc" }
  });
  return (
    <div>
      <h1 className="display-type text-4xl">Connector health.</h1>
      <div className="mt-8 space-y-3">
        {configs.map((config) => (
          <Card key={config.id}>
            <CardContent className="grid items-center gap-4 p-5 md:grid-cols-[1fr_auto_auto_auto]">
              <div>
                <p className="font-semibold">{config.platform}</p>
                <p className="text-sm text-muted-foreground">
                  {config.connectorType} · {config.affiliateAccount?.label ?? "No account"}
                </p>
              </div>
              <Badge variant={config.enabled ? "default" : "secondary"}>
                {config.enabled ? config.mode : "DISABLED"}
              </Badge>
              <p className="text-sm">{config.health?.lagSeconds ?? "—"}s lag</p>
              <p className="text-xs text-muted-foreground">
                {config.health?.lastSuccessAt?.toLocaleString("vi-VN") ?? "Chưa sync"}
              </p>
            </CardContent>
          </Card>
        ))}
        {!configs.length ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            Chạy seed để tạo connector config ban đầu.
          </p>
        ) : null}
      </div>
    </div>
  );
}

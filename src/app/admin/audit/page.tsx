import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";

export default async function AuditPage() {
  const events = await db.auditLog.findMany({
    include: { actor: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return (
    <div>
      <h1 className="display-type text-4xl">Audit log.</h1>
      <div className="mt-8 space-y-2">
        {events.map((event) => (
          <Card key={event.id}>
            <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-[auto_1fr_1fr_auto]">
              <Badge variant="secondary">{event.action}</Badge>
              <span>{event.actor?.email ?? "system"}</span>
              <span>
                {event.entityType} · {event.entityId ?? "—"}
              </span>
              <span className="text-muted-foreground">
                {event.createdAt.toLocaleString("vi-VN")}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

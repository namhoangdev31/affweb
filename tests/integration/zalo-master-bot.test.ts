import { describe, expect, it } from "vitest";
import { GET as legacyGet, POST as legacyPost } from "@/app/api/saas/zalo-qr/route";
import { POST as webhookPost } from "@/app/api/webhooks/zalo/route";

describe("Zalo security boundaries", () => {
  it("retires both legacy QR mutation methods", async () => {
    expect((await legacyGet()).status).toBe(410);
    expect((await legacyPost()).status).toBe(410);
  });

  it("rejects webhook payloads without the provider secret", async () => {
    const response = await webhookPost(
      new Request("http://127.0.0.1/api/webhooks/zalo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      })
    );
    expect(response.status).toBe(403);
  });

  it("acknowledges unsupported events without processing them", async () => {
    const previousSecret = process.env.ZALO_BOT_SECRET_TOKEN;
    process.env.ZALO_BOT_SECRET_TOKEN = "integration-secret";
    try {
      const response = await webhookPost(
        new Request("http://127.0.0.1/api/webhooks/zalo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Bot-Api-Secret-Token": "integration-secret"
          },
          body: JSON.stringify({
            ok: true,
            result: { event_name: "message.unsupported.received" }
          })
        })
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ ok: true, ignored: true });
    } finally {
      if (previousSecret === undefined) delete process.env.ZALO_BOT_SECRET_TOKEN;
      else process.env.ZALO_BOT_SECRET_TOKEN = previousSecret;
    }
  });
});

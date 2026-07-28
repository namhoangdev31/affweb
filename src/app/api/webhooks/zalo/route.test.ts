import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.ZALO_BOT_SECRET_TOKEN = "unit-test-secret";
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers()
}));

import { POST } from "@/app/api/webhooks/zalo/route";

describe("Zalo webhook contract", () => {
  it("rejects requests without the configured secret", async () => {
    const response = await POST(
      new Request("http://127.0.0.1/api/webhooks/zalo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      })
    );
    expect(response.status).toBe(403);
  });

  it("acknowledges unsupported events without touching domain state", async () => {
    const response = await POST(
      new Request("http://127.0.0.1/api/webhooks/zalo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bot-Api-Secret-Token": "unit-test-secret"
        },
        body: JSON.stringify({
          ok: true,
          result: { event_name: "message.unsupported.received" }
        })
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, ignored: true });
  });
});

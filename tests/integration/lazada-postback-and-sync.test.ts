import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/webhooks/lazada/route";

describe("Lazada webhook production boundary", () => {
  it.each([
    ["GET", GET],
    ["POST", POST]
  ] as const)("returns 410 for unsigned %s postbacks", async (method, handler) => {
    const response = await handler(new Request("http://127.0.0.1/api/webhooks/lazada", { method }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("disabled")
    });
  });
});

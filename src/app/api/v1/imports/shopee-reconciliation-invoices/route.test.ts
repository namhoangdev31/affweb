import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/v1/imports/shopee-reconciliation-invoices/route";

describe("Shopee reconciliation invoice contract gate", () => {
  it("fails closed before reading multipart input", async () => {
    const response = await POST();
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(503);
    expect(body.error?.code).toBe("CONNECTOR_DISABLED");
  });
});

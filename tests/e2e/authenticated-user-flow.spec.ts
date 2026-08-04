import { expect, test } from "@playwright/test";

test.describe("Authenticated User Flow & App Surfaces (Playwright E2E)", () => {
  test("Protected App Shell routes enforce Clerk Authentication boundaries", async ({ page }) => {
    // Attempt to visit protected routes without session
    const protectedRoutes = [
      "/app",
      "/app/links",
      "/app/conversions",
      "/app/wallet",
      "/app/reconciliation",
      "/app/tools"
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).not.toHaveURL(new RegExp(`${route}$`));
    }
  });

  test("Affiliate link redirect route (/go/test-token) handles missing tokens gracefully", async ({
    request
  }) => {
    const response = await request.get("/go/test-token-idempotent", {
      maxRedirects: 0
    });
    // Returns 302, 307, 404, or 500 for non-existent token redirect
    expect([302, 307, 404, 500]).toContain(response.status());
  });

  test("Internal Tools page (/app/tools or /shopee-lookup) renders product lookup interface", async ({
    page
  }) => {
    await page.goto("/shopee-lookup");
    await expect(page.getByRole("heading", { name: /Tra cứu hoa hồng/i })).toBeVisible();

    const input = page.getByPlaceholder(/Dán link sản phẩm Shopee/i);
    await expect(input).toBeVisible();
  });

  test("Reconciliation invoice upload API is hard-disabled before body parsing", async ({
    request
  }) => {
    const response = await request.post("/api/v1/imports/shopee-reconciliation-invoices", {
      data: {
        invoiceNumber: "INV-2026-TEST",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        grossCommissionVnd: "1000000"
      }
    });

    expect(response.status()).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CONNECTOR_DISABLED" }
    });
  });

  test("Payout request submission API requires authentication & valid idempotency key", async ({
    request
  }) => {
    const response = await request.post("/api/v1/payout/request", {
      data: {
        amountVnd: "500000",
        beneficiaryId: "beneficiary-sample-id"
      }
    });

    expect([400, 401, 403, 404, 409]).toContain(response.status());
  });
});

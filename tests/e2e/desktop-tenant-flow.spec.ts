import { expect, test } from "@playwright/test";

test.describe("Desktop Multi-Tenant & End-to-End Core Flows", () => {
  test("Desktop landing page loads with primary branding and call-to-action buttons", async ({
    page
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Hoàn Tiền|Cashback/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("Partners ecosystem page allows Shopee drilldown and hides gated Lazada", async ({
    page
  }) => {
    await page.goto("/partners");
    await expect(
      page.getByRole("heading", { name: "Những nơi bạn vẫn mua mỗi ngày." })
    ).toBeVisible();

    const shopeeHeading = page.getByRole("heading", { name: "Shopee", exact: true });
    await expect(shopeeHeading).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lazada", exact: true })).toHaveCount(0);
    await shopeeHeading.click();
    await expect(page).toHaveURL(/\/partners\/shopee/);
  });

  test("Path-based Multi-Tenancy routing handles /t/:tenantSlug requests cleanly", async ({
    page
  }) => {
    await page.goto("/t/sansale-koc");
    // Verify page loads without crash
    await expect(page.locator("body")).toBeVisible();
  });

  test("API Health endpoints respond with operational status", async ({ request }) => {
    const liveRes = await request.get("/api/health/live");
    expect(liveRes.ok()).toBe(true);
    const liveJson = await liveRes.json();
    expect(liveJson.status).toBe("ok");

    const readyRes = await request.get("/api/health/ready");
    expect([200, 503]).toContain(readyRes.status());
    const readyJson = await readyRes.json();
    expect(readyJson.status).toBeDefined();
  });
});

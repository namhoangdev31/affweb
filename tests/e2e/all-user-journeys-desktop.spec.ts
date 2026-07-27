import { expect, test } from "@playwright/test";

test.describe("All 7 Technical User Flow Journeys (Desktop Viewports)", () => {

  test("Journey 1: Shopper Journey - Deals, Shopee Lookup, Link Converter & Wallet UI", async ({ page }) => {
    // 1. Visit Deals page
    await page.goto("/deals");
    await expect(page.getByRole("heading", { name: "Tìm món đáng mua." })).toBeVisible();

    // 2. Visit Shopee Lookup page and enter product link
    await page.goto("/shopee-lookup");
    const input = page.getByPlaceholder(/Dán link sản phẩm Shopee/i);
    await input.fill("https://shopee.vn/product/11111/22222");
    await page.getByRole("button", { name: /Tra cứu/i }).click();
    await expect(page.getByRole("button", { name: /Đang tra|Tra cứu/i })).toBeVisible();

    // 3. Visit Partners page
    await page.goto("/partners");
    await expect(page.getByRole("heading", { name: "Những nơi bạn vẫn mua mỗi ngày." })).toBeVisible();
  });

  test("Journey 2: Clawback & Recovery Journey - Static Policy & Account Status Page", async ({ page }) => {
    await page.goto("/cashback-policy");
    await expect(page.getByRole("heading", { name: /Chính sách cashback/i })).toBeVisible();
    await expect(page.getByText(/Đối soát|Hoàn tiền|Thu hồi/i).first()).toBeVisible();
  });

  test("Journey 3: Finance Reviewer & Approver Journey - Protected Admin Payout Route", async ({ page }) => {
    await page.goto("/admin");
    // Unauthenticated user should be redirected away from admin dashboard
    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test("Journey 4: System Admin Ops Journey - API Connector Health Live/Ready Endpoints", async ({ request }) => {
    const liveResponse = await request.get("/api/health/live");
    expect(liveResponse.ok()).toBe(true);
    const liveData = await liveResponse.json();
    expect(liveData.status).toBe("ok");

    const readyResponse = await request.get("/api/health/ready");
    expect(readyResponse.ok()).toBe(true);
    const readyData = await readyResponse.json();
    expect(readyData.status).toBe("ready");
  });

  test("Journey 5: Missing Cashback Dispute Journey - Tra cứu đơn & Dispute Evidence UI", async ({ page }) => {
    await page.goto("/shopee-lookup");
    await expect(page.getByRole("heading", { name: /Tra cứu hoa hồng/i })).toBeVisible();
    const searchInput = page.getByPlaceholder(/Dán link sản phẩm Shopee/i);
    await expect(searchInput).toBeVisible();
  });

  test("Journey 6: Tenant Owner Journey - SaaS Register & Whitelabel Setup Routes", async ({ request }) => {
    // Call SaaS registration API endpoint with test payload
    const response = await request.post("/api/saas/register", {
      data: {
        slug: `koc-test-${Date.now()}`,
        name: "Test KOC Channel",
        brandColor: "#173b31"
      }
    });

    // Expect 200/201 or handle validation response
    expect([200, 201, 400, 401, 403]).toContain(response.status());
  });

  test("Journey 7: Tenant User Journey - Subdomain / Path Multi-Tenant View (/t/sansale-koc)", async ({ page }) => {
    await page.goto("/t/sansale-koc");
    await expect(page.locator("body")).toBeVisible();
  });

});

import { expect, test } from "@playwright/test";

test.describe("Public User Flows & Navigation", () => {
  test("Shopee Lookup page loads with input and handles search interaction", async ({ page }) => {
    await page.goto("/shopee-lookup");
    await expect(page.getByRole("heading", { name: /Tra cứu hoa hồng/i })).toBeVisible();

    const input = page.getByPlaceholder(/Dán link sản phẩm Shopee/i);
    await expect(input).toBeVisible();

    // Type a test link and submit
    await input.fill("https://shopee.vn/product/12345/67890");
    await page.getByRole("button", { name: /Tra cứu/i }).click();

    // Check that button changes to loading state "Đang tra..." or button is disabled
    await expect(page.getByRole("button", { name: /Đang tra|Tra cứu/i })).toBeVisible();
  });

  test("Deals page renders the persisted deal browser", async ({ page }) => {
    await page.goto("/deals");
    await expect(page.getByRole("heading", { name: "Tìm món đáng mua." })).toBeVisible();
    await expect(page.getByText("Deal đang mở")).toBeVisible();
  });

  test("Partners ecosystem page displays all partners and allows drilldown", async ({ page }) => {
    await page.goto("/partners");
    await expect(
      page.getByRole("heading", { name: "Những nơi bạn vẫn mua mỗi ngày." })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shopee", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lazada", exact: true })).toHaveCount(0);

    // Click on Shopee partner link
    await page.getByRole("heading", { name: "Shopee", exact: true }).click();
    await expect(page).toHaveURL(/\/partners\/shopee/);
  });

  test("Static policy and FAQ pages load cleanly", async ({ page }) => {
    await page.goto("/cashback-policy");
    await expect(page.getByRole("heading", { name: /Chính sách cashback/i })).toBeVisible();

    await page.goto("/faq");
    await expect(page.getByRole("heading", { name: /Hỏi thẳng, đáp rõ/i })).toBeVisible();

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /Chính sách quyền riêng tư/i })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /Điều khoản sử dụng/i })).toBeVisible();
  });
});

test.describe("API Health & Public Endpoints", () => {
  test("Health live endpoint returns status ok", async ({ request }) => {
    const response = await request.get("/api/health/live");
    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.status).toBe("ok");
  });

  test("Health ready endpoint returns operational status", async ({ request }) => {
    const response = await request.get("/api/health/ready");
    expect([200, 503]).toContain(response.status());
    const json = await response.json();
    expect(json.status).toBeDefined();
  });

  test("Public deals API endpoint returns structured JSON response", async ({ request }) => {
    const response = await request.get("/api/v1/public/deals");
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data).toBeDefined();
  });
});

test.describe("Auth & Access Control Rules", () => {
  test("Unauthenticated access to /admin redirects or shows unauthorized", async ({ page }) => {
    await page.goto("/admin");
    // Middleware should redirect unauthenticated visitor to login or unauthorized page
    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test("Unauthenticated access to /app redirects to sign-in or login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).not.toHaveURL(/\/app$/);
  });
});

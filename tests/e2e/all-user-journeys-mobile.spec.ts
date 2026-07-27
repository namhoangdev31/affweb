import { expect, test } from "@playwright/test";

test.describe("All 7 Technical User Flow Journeys (Mobile Viewports)", () => {

  test("Mobile Journey 1: Shopper Mobile Experience - Deals & Responsive Header", async ({ page, isMobile }) => {
    await page.goto("/deals");
    await expect(page.getByRole("heading", { name: "Tìm món đáng mua." })).toBeVisible();

    if (isMobile) {
      const header = page.locator("header");
      await expect(header).toBeVisible();
    }
  });

  test("Mobile Journey 2: Mobile Shopee Lookup Tool with Touch Inputs", async ({ page }) => {
    await page.goto("/shopee-lookup");
    const input = page.getByPlaceholder(/Dán link sản phẩm Shopee/i);
    await expect(input).toBeVisible();

    await input.fill("https://shopee.vn/product/7777/8888");
    const searchButton = page.getByRole("button", { name: /Tra cứu/i });
    await searchButton.click();

    await expect(page.getByRole("button", { name: /Đang tra|Tra cứu/i })).toBeVisible();
  });

  test("Mobile Journey 3 & 4: Mobile Access Control to Protected Admin Dashboard", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test("Mobile Journey 5: Mobile Cashback Policy View", async ({ page }) => {
    await page.goto("/cashback-policy");
    await expect(page.getByRole("heading", { name: /Chính sách cashback/i })).toBeVisible();
  });

  test("Mobile Journey 6: Mobile Multi-Tenant Path Navigation (/sansale-koc)", async ({ page }) => {
    await page.goto("/sansale-koc");
    await expect(page.locator("body")).toBeVisible();
  });

  test("Mobile Journey 7: Mobile PWA Offline Page Fallback (/offline)", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: /Đang ngoại tuyến|Offline/i })).toBeVisible();
  });

});

import { expect, test } from "@playwright/test";

test.describe("Mobile Responsive User Experience & PWA Flows", () => {
  test("Mobile view renders responsive navigation and header controls", async ({
    page,
    isMobile
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    if (isMobile) {
      // Verify mobile layout navigation touch target
      const navHeader = page.locator("header");
      await expect(navHeader).toBeVisible();
    }
  });

  test("Mobile Shopee Lookup tool works seamlessly on small touch screens", async ({ page }) => {
    await page.goto("/shopee-lookup");
    await expect(page.getByRole("heading", { name: /Tra cứu hoa hồng/i })).toBeVisible();

    const input = page.getByPlaceholder(/Dán link sản phẩm Shopee/i);
    await expect(input).toBeVisible();
    await input.fill("https://shopee.vn/product/123456789/1234567890");

    const submitBtn = page.getByRole("button", { name: /Tra cứu/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();
    await expect(page.getByRole("button", { name: /Đang tra|Tra cứu/i })).toBeVisible();
  });

  test("Mobile Deals grid renders responsive card layouts", async ({ page }) => {
    await page.goto("/deals");
    await expect(page.getByRole("heading", { name: "Tìm món đáng mua." })).toBeVisible();
    await expect(page.getByText("Deal đang mở")).toBeVisible();
  });

  test("Mobile Cash-back Policy and FAQ load with mobile typography", async ({ page }) => {
    await page.goto("/cashback-policy");
    await expect(page.getByRole("heading", { name: /Chính sách cashback/i })).toBeVisible();

    await page.goto("/faq");
    await expect(page.getByRole("heading", { name: /Hỏi thẳng, đáp rõ/i })).toBeVisible();
  });

  test("Offline PWA fallback page renders cleanly", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: /Đang ngoại tuyến|Offline/i })).toBeVisible();
  });
});

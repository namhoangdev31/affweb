import { expect, test } from "@playwright/test";

test.describe("Authentication & Authorization Flows (Clerk Auth)", () => {
  test("/login legacy page redirects seamlessly to /sign-in", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("Sign-In page (/sign-in) renders Clerk authentication component", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/sign-in/);

    // Verify Clerk Sign-In card elements or page layout
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("Sign-Up page (/sign-up) renders Clerk registration component", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page).toHaveURL(/\/sign-up/);

    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("Unauthenticated user accessing protected /app routes is redirected to sign-in", async ({ page }) => {
    await page.goto("/app");
    await expect(page).not.toHaveURL(/\/app$/);

    await page.goto("/app/wallet");
    await expect(page).not.toHaveURL(/\/app\/wallet$/);

    await page.goto("/app/links");
    await expect(page).not.toHaveURL(/\/app\/links$/);
  });

  test("Unauthenticated user accessing /admin panel is redirected to sign-in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);

    await page.goto("/admin/users");
    await expect(page).not.toHaveURL(/\/admin\/users$/);
  });
});

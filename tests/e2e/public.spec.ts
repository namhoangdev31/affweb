import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public visitor can understand the cashback flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Mua như cũ/i })).toBeVisible();
  await page.getByRole("link", { name: "Xem cách hoạt động" }).click();
  await expect(page.getByRole("heading", { name: "Từ cú nhấp đến tiền hoàn." })).toBeVisible();
  await expect(page.getByText("Ledger minh bạch")).toBeVisible();
});

test("manifest and service worker expose safe PWA behavior", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");

  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBe(true);
  const source = await worker.text();
  expect(source).toContain('"/api/"');
  expect(source).toContain('"/admin"');
  expect(worker.headers()["service-worker-allowed"]).toBe("/");
});

test("core public page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical"
    )
  ).toEqual([]);
});

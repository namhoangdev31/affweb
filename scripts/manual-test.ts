import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const outputDir =
  "/Users/hoangnam/.gemini/antigravity/brain/41d407f1-1577-4949-ace5-563cae0cc699/screenshots";
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function runManualTesting() {
  console.log(
    "🚀 Starting Interactive Manual Browser Test (Auth & Public Flows) against http://localhost:3000 ..."
  );
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  // 1. Test Sign-In Page
  console.log("1. Testing Sign-In Page (/sign-in)...");
  await page.goto("http://localhost:3000/sign-in");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outputDir, "09_sign_in_page.png"), fullPage: true });

  // 2. Test Sign-Up Page
  console.log("2. Testing Sign-Up Page (/sign-up)...");
  await page.goto("http://localhost:3000/sign-up");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outputDir, "10_sign_up_page.png"), fullPage: true });

  // 3. Test Legacy /login redirect
  console.log("3. Testing Legacy /login redirect...");
  await page.goto("http://localhost:3000/login");
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(outputDir, "11_legacy_login_redirect.png"),
    fullPage: true
  });

  // 4. Test Protected Route (/app) Redirect
  console.log("4. Testing Protected /app Redirect...");
  await page.goto("http://localhost:3000/app");
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(outputDir, "12_protected_app_redirect.png"),
    fullPage: true
  });

  await browser.close();
  console.log("✅ Interactive Auth Manual Test completed! Screenshots saved to:", outputDir);
}

runManualTesting().catch((err) => {
  console.error("❌ Error in auth manual testing:", err);
  process.exit(1);
});

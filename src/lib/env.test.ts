import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadServerEnv, productionReadinessIssues, resetEnvCacheForTests } from "@/lib/env";
import { ShopeeDirectConnector, ShopeeFoodConnector } from "@/modules/connectors/shopee";
import { AddLiveTagConnector } from "@/modules/connectors/addlivetag";
import { AccessTradeConnector } from "@/modules/connectors/accesstrade";
import { LazadaConnector } from "@/modules/connectors/lazada";
import { connectorFor } from "@/modules/connectors/registry";

describe("Environment Variables Audit & Readiness Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetEnvCacheForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  it("provides sensible defaults for optional development ENVs", () => {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    delete process.env.APP_BASE_URL;
    delete process.env.ADDLIVETAG_ENABLED;
    delete process.env.ACCESSTRADE_ENABLED;
    delete process.env.LAZADA_MODE;

    const env = loadServerEnv();
    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_BASE_URL).toBe("http://localhost:3000");
    expect(env.ADDLIVETAG_ENABLED).toBe(false);
    expect(env.ACCESSTRADE_ENABLED).toBe(false);
    expect(env.LAZADA_MODE).toBe("credential_ready");
  });

  it("validates core required variables in production readiness check", () => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;
    delete process.env.AUTH_SECRET;
    delete process.env.BANK_DATA_ENCRYPTION_KEY_V1;

    const issues = productionReadinessIssues(loadServerEnv());
    expect(issues.some((i) => i.includes("DATABASE_URL is required."))).toBe(true);
    expect(issues.some((i) => i.includes("DIRECT_URL is required."))).toBe(true);
    expect(issues.some((i) => i.includes("AUTH_SECRET is required."))).toBe(true);
    expect(issues.some((i) => i.includes("BANK_DATA_ENCRYPTION_KEY_V1 is required."))).toBe(true);
  });

  it("validates AUTH_SECRET minimum length requirement (>= 32 bytes)", () => {
    process.env.AUTH_SECRET = "too-short-secret";

    const issues = productionReadinessIssues(loadServerEnv());
    expect(issues.some((i) => i.includes("AUTH_SECRET must contain at least 32 bytes."))).toBe(true);
  });

  it("validates BANK_DATA_ENCRYPTION_KEY_V1 base64 length requirement (32 bytes)", () => {
    process.env.BANK_DATA_ENCRYPTION_KEY_V1 = Buffer.from("short-key").toString("base64");

    const issues = productionReadinessIssues(loadServerEnv());
    expect(
      issues.some((i) => i.includes("BANK_DATA_ENCRYPTION_KEY_V1 must be a base64-encoded 32-byte key."))
    ).toBe(true);
  });

  it("fails closed on ShopeeDirectConnector when SHOPEE_AFFILIATE_ID is missing", async () => {
    delete process.env.SHOPEE_AFFILIATE_ID;

    const connector = new ShopeeDirectConnector();
    const health = await connector.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.message).toContain("Thiếu SHOPEE_AFFILIATE_ID.");

    await expect(
      connector.createTrackingLink({
        target: { platform: "SHOPEE_MARKETPLACE", targetType: "PRODUCT", canonicalUrl: "https://shopee.vn/product/1/2" },
        clickToken: "clk_test",
        subIds: ["clk_test"]
      })
    ).rejects.toThrow("Shopee connector chưa được cấu hình.");
  });

  it("always uses ShopeeDirectConnector (an_redir) for Shopee Marketplace in Vietnam", () => {
    const connector = connectorFor("SHOPEE_MARKETPLACE");
    expect(connector).toBeInstanceOf(ShopeeDirectConnector);
  });

  it("fails closed on AddLiveTagConnector when ADDLIVETAG_ENABLED or API_KEY is missing", async () => {
    delete process.env.ADDLIVETAG_ENABLED;
    delete process.env.ADDLIVETAG_API_KEY;

    const connector = new AddLiveTagConnector("SHOPEE_MARKETPLACE");
    const health = await connector.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.message).toContain("AddLiveTag chưa được cấu hình.");
  });

  it("fails closed on AccessTradeConnector when ACCESSTRADE_ENABLED or API_KEY is missing", async () => {
    delete process.env.ACCESSTRADE_ENABLED;
    delete process.env.ACCESSTRADE_API_KEY;

    const connector = new AccessTradeConnector();
    const health = await connector.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.message).toContain("AccessTrade chưa được cấu hình.");
  });

  it("enforces Lazada credentials requirement when LAZADA_MODE is active", () => {
    process.env.LAZADA_MODE = "active";
    delete process.env.LAZADA_AFFILIATE_ID;

    const issues = productionReadinessIssues(loadServerEnv());
    expect(issues.some((i) => i.includes("All Lazada credentials are required in active mode."))).toBe(true);
  });
});

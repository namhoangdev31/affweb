import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalDatabaseIdentity,
  requireDisposableTestDatabase,
  requireDisposableTestDatabasePair
} from "../../tests/integration/database-guard";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
});

function enableDisposableReset(): void {
  vi.stubEnv("NODE_ENV", "test");
  process.env.ALLOW_TEST_DATABASE_RESET = "true";
  delete process.env.PRODUCTION_DATABASE_URL;
  delete process.env.PRODUCTION_DIRECT_URL;
}

describe("integration database guard", () => {
  it("canonicalizes pooled and unpooled Neon URLs to the same database", () => {
    expect(
      canonicalDatabaseIdentity(
        "postgresql://user:pass@ep-name-pooler.ap-southeast-1.aws.neon.tech/db"
      )
    ).toBe(
      canonicalDatabaseIdentity(
        "postgres://other:pass@ep-name.ap-southeast-1.aws.neon.tech:5432/db"
      )
    );
  });

  it("rejects the runtime database even when URL spelling differs", () => {
    enableDisposableReset();
    process.env.DATABASE_URL =
      "postgresql://user:pass@ep-name-pooler.ap-southeast-1.aws.neon.tech/affweb_test";
    process.env.TEST_DATABASE_URL =
      "postgres://other:pass@ep-name.ap-southeast-1.aws.neon.tech:5432/affweb_test?sslmode=require";

    expect(() => requireDisposableTestDatabase()).toThrow("must differ");
  });

  it("rejects a production-like Neon database and ignores query markers", () => {
    enableDisposableReset();
    process.env.TEST_DATABASE_HOST_ALLOWLIST = "neon.tech";
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.TEST_DATABASE_URL =
      "postgresql://user:pass@ep-name.ap-southeast-1.aws.neon.tech/neondb?test=true";

    expect(() => requireDisposableTestDatabase()).toThrow("database name must contain");
  });

  it("accepts an explicitly disposable database name", () => {
    enableDisposableReset();
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.TEST_DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/affweb_disposable";

    expect(requireDisposableTestDatabase()).toBe(process.env.TEST_DATABASE_URL);
  });

  it("rejects invalid protocols", () => {
    enableDisposableReset();
    process.env.TEST_DATABASE_URL = "https://example.com/affweb_test";
    expect(() => requireDisposableTestDatabase()).toThrow("PostgreSQL protocol");
  });

  it("rejects unless reset authority is explicit", () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.ALLOW_TEST_DATABASE_RESET;
    process.env.TEST_DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/affweb_test";
    expect(() => requireDisposableTestDatabase()).toThrow("ALLOW_TEST_DATABASE_RESET");
  });

  it("requires pooled and direct URLs to identify the same logical database", () => {
    enableDisposableReset();
    process.env.TEST_DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/affweb_test";
    process.env.TEST_DIRECT_URL = "postgresql://user:pass@127.0.0.1:5432/other_test";
    expect(() => requireDisposableTestDatabasePair()).toThrow("same database");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalDatabaseIdentity,
  requireDisposableTestDatabase
} from "../../tests/integration/database-guard";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

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
    process.env.DATABASE_URL =
      "postgresql://user:pass@ep-name-pooler.ap-southeast-1.aws.neon.tech/affweb_test";
    process.env.TEST_DATABASE_URL =
      "postgres://other:pass@ep-name.ap-southeast-1.aws.neon.tech:5432/affweb_test?sslmode=require";

    expect(() => requireDisposableTestDatabase()).toThrow("must differ");
  });

  it("rejects a production-like Neon database and ignores query markers", () => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.TEST_DATABASE_URL =
      "postgresql://user:pass@ep-name.ap-southeast-1.aws.neon.tech/neondb?test=true";

    expect(() => requireDisposableTestDatabase()).toThrow("database name must contain");
  });

  it("accepts an explicitly disposable database name", () => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.TEST_DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/affweb_disposable";

    expect(requireDisposableTestDatabase()).toBe(process.env.TEST_DATABASE_URL);
  });

  it("rejects invalid protocols", () => {
    process.env.TEST_DATABASE_URL = "https://example.com/affweb_test";
    expect(() => requireDisposableTestDatabase()).toThrow("PostgreSQL protocol");
  });
});

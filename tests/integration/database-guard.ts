export function canonicalDatabaseIdentity(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Database URL must be a valid PostgreSQL URL.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("Database URL must use the PostgreSQL protocol.");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, "")).toLowerCase();
  if (!parsed.hostname || !databaseName || databaseName.includes("/")) {
    throw new Error("Database URL must include one database name.");
  }
  const host = parsed.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
  const port = parsed.port || "5432";
  return `${host}:${port}/${databaseName}`;
}

function assertTestHostAllowed(url: string): void {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "postgres") return;
  const allowlist = (process.env.TEST_DATABASE_HOST_ALLOWLIST ?? "neon.tech")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`))) {
    throw new Error("Test database hostname is not in TEST_DATABASE_HOST_ALLOWLIST.");
  }
}

export function requireDisposableTestDatabasePair(): {
  pooledUrl: string;
  directUrl: string;
} {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Database reset and integration tests require NODE_ENV=test.");
  }
  if (process.env.ALLOW_TEST_DATABASE_RESET !== "true") {
    throw new Error("Database reset requires ALLOW_TEST_DATABASE_RESET=true.");
  }
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "Integration tests require TEST_DATABASE_URL for an isolated disposable database."
    );
  }

  const directUrl = process.env.TEST_DIRECT_URL ?? testDatabaseUrl;
  const runtimeUrls = [
    process.env.DATABASE_URL,
    process.env.DIRECT_URL,
    process.env.DATABASE_URL_UNPOOLED
  ].filter((value): value is string => Boolean(value));

  const testIdentity = canonicalDatabaseIdentity(testDatabaseUrl);
  const directIdentity = canonicalDatabaseIdentity(directUrl);
  if (testIdentity !== directIdentity) {
    throw new Error("TEST_DATABASE_URL and TEST_DIRECT_URL must identify the same database.");
  }
  const databaseName = decodeURIComponent(
    new URL(testDatabaseUrl).pathname.replace(/^\//, "")
  ).toLowerCase();
  const DISPOSABLE_DB_PATTERNS = ["test", "ci", "tmp", "disposable"];
  if (!DISPOSABLE_DB_PATTERNS.some((pattern) => databaseName.includes(pattern))) {
    throw new Error(
      "Integration test database name must contain 'test', 'ci', 'tmp', or 'disposable'."
    );
  }

  if (runtimeUrls.some((value) => canonicalDatabaseIdentity(value) === testIdentity)) {
    throw new Error("TEST_DATABASE_URL must differ from every runtime or migration database URL.");
  }

  if (process.env.PRODUCTION_DATABASE_URL || process.env.PRODUCTION_DIRECT_URL) {
    throw new Error(
      "Production database credentials must not be present in the integration process."
    );
  }
  assertTestHostAllowed(testDatabaseUrl);
  assertTestHostAllowed(directUrl);
  return { pooledUrl: testDatabaseUrl, directUrl };
}

export function requireDisposableTestDatabase(): string {
  return requireDisposableTestDatabasePair().pooledUrl;
}

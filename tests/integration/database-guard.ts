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

export function requireDisposableTestDatabase(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "Integration tests require TEST_DATABASE_URL for an isolated disposable database."
    );
  }

  const runtimeUrls = [
    process.env.DATABASE_URL,
    process.env.DIRECT_URL,
    process.env.DATABASE_URL_UNPOOLED
  ].filter((value): value is string => Boolean(value));

  const testIdentity = canonicalDatabaseIdentity(testDatabaseUrl);
  if (runtimeUrls.some((value) => canonicalDatabaseIdentity(value) === testIdentity)) {
    throw new Error("TEST_DATABASE_URL must differ from every runtime or migration database URL.");
  }

  const databaseName = testIdentity.slice(testIdentity.indexOf("/") + 1);
  if (!/(^|[_-])(test|ci|tmp|disposable)([_-]|$)/.test(databaseName)) {
    throw new Error(
      "TEST_DATABASE_URL database name must contain a test, ci, tmp, or disposable marker."
    );
  }
  return testDatabaseUrl;
}

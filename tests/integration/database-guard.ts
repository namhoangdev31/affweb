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

  if (runtimeUrls.includes(testDatabaseUrl)) {
    throw new Error("TEST_DATABASE_URL must differ from every runtime or migration database URL.");
  }

  const parsed = new URL(testDatabaseUrl);
  const databaseName = parsed.pathname.slice(1).toLowerCase();
  const host = parsed.hostname.toLowerCase();
  if (
    !/(^|[_-])(test|ci|tmp|disposable)([_-]|$)/.test(databaseName) &&
    !host.includes("neon") &&
    !parsed.searchParams.has("test")
  ) {
    throw new Error(
      "TEST_DATABASE_URL database name or host must identify an isolated test/disposable database."
    );
  }
  return testDatabaseUrl;
}

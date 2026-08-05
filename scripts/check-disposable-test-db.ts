import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

Object.assign(process.env, { NODE_ENV: "test" });
Object.assign(process.env, { ALLOW_TEST_DATABASE_RESET: "true" });

const { canonicalDatabaseIdentity, requireDisposableTestDatabasePair } =
  await import("../tests/integration/database-guard");

function redactedDatabaseLabel(value: string): string {
  const parsed = new URL(value);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "5432"}/${database}`;
}

try {
  const { pooledUrl, directUrl } = requireDisposableTestDatabasePair();
  const identity = canonicalDatabaseIdentity(pooledUrl);

  console.log("Disposable PostgreSQL test database check passed.");
  console.log(`Logical identity: ${identity}`);
  console.log(`Pooled URL: ${redactedDatabaseLabel(pooledUrl)}`);
  console.log(`Direct URL: ${redactedDatabaseLabel(directUrl)}`);
  console.log("Secrets are intentionally not printed.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown database guard error.";
  console.error("Disposable PostgreSQL test database check failed.");
  console.error(message);
  console.error("");
  console.error("Add these variables to .env.local or export them before running:");
  console.error("TEST_DATABASE_URL=<pooled disposable PostgreSQL URL>");
  console.error("TEST_DIRECT_URL=<optional direct disposable PostgreSQL URL>");
  console.error(
    "TEST_DATABASE_HOST_ALLOWLIST=<optional, defaults allow localhost/postgres/neon.tech>"
  );
  process.exitCode = 1;
}

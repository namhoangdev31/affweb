import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

Object.assign(process.env, { NODE_ENV: "test" });
Object.assign(process.env, { ALLOW_TEST_DATABASE_RESET: "true" });

const { canonicalDatabaseIdentity, requireDisposableTestDatabasePair } =
  await import("../tests/integration/database-guard");

let pooledUrl: string;
let directUrl: string;
try {
  ({ pooledUrl, directUrl } = requireDisposableTestDatabasePair());
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown database guard error.";
  console.error("Disposable PostgreSQL integration preflight failed.");
  console.error(message);
  console.error("");
  console.error("Add these variables to .env.local or export them before running:");
  console.error("TEST_DATABASE_URL=<pooled disposable PostgreSQL URL>");
  console.error("TEST_DIRECT_URL=<optional direct disposable PostgreSQL URL>");
  console.error(
    "TEST_DATABASE_HOST_ALLOWLIST=<optional, defaults allow localhost/postgres/neon.tech>"
  );
  process.exit(1);
}
const testArgs = process.argv.slice(2);
const vitestArgs = [
  "exec",
  "vitest",
  "run",
  ...testArgs,
  "--config",
  "vitest.integration.config.ts"
];

console.log("Running PostgreSQL integration tests against disposable database.");
console.log(`Logical identity: ${canonicalDatabaseIdentity(pooledUrl)}`);
console.log("Secrets are intentionally not printed.");

const result = spawnSync("pnpm", vitestArgs, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "test",
    TEST_DATABASE_URL: pooledUrl,
    TEST_DIRECT_URL: directUrl
  },
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;

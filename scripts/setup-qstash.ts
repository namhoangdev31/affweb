import { assertFinanceRuntimeConfig, loadServerEnv } from "../src/lib/env";

const env = loadServerEnv();

if (!env.QSTASH_TOKEN) {
  throw new Error("QSTASH_TOKEN is required.");
}
if (!env.APP_BASE_URL?.startsWith("https://")) {
  throw new Error("APP_BASE_URL must be a public HTTPS URL.");
}

assertFinanceRuntimeConfig(env);
if (!env.QSTASH_CURRENT_SIGNING_KEY || !env.QSTASH_NEXT_SIGNING_KEY) {
  throw new Error("QStash signing keys are required.");
}

console.log("QStash recovery configuration is valid; no recurring schedules were created.");

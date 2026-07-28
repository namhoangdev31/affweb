import { Client } from "@upstash/qstash";
import { loadServerEnv } from "../src/lib/env";

const env = loadServerEnv();

if (!env.QSTASH_TOKEN) {
  throw new Error("QSTASH_TOKEN is required.");
}
if (!env.APP_BASE_URL?.startsWith("https://")) {
  throw new Error("APP_BASE_URL must be a public HTTPS URL.");
}

const qstash = new Client({ token: env.QSTASH_TOKEN });
const queueName = "affweb-financial-jobs";
await qstash.queue({ queueName }).upsert({ parallelism: 1 });
const failureCallback = new URL("/api/internal/qstash-failure", env.APP_BASE_URL).toString();

const schedules = [
  ["connector-health", "*/5 * * * *"],
  ["payout-reconciliation", "*/5 * * * *"],
  ["sync-addlivetag", "*/10 * * * *"],
  ["sync-accesstrade", "*/15 * * * *"],
  ["reconcile-accesstrade-orders", "30 19 * * *"],
  ["sync-lazada", "*/15 * * * *"],
  ["release-safety-holds", "0 * * * *"],
  ["sync-offers", "5 * * * *"],
  ["notification-dispatch", "*/5 * * * *"],
  ["zalo-dispatch", "*/5 * * * *"],
  ["saas-lifecycle", "*/15 * * * *"],
  // QStash cron runs in UTC: these correspond to 02:00, 03:00 and Sunday 04:00 in Vietnam.
  ["backfill-conversions", "0 19 * * *"],
  ["ledger-invariant", "0 20 * * *"],
  ["evidence-integrity", "0 21 * * 6"]
] as const;

for (const [jobName, cron] of schedules) {
  const scheduleId = `affweb-${jobName}`;
  const destination = new URL(`/api/internal/jobs/${jobName}`, env.APP_BASE_URL).toString();
  await qstash.schedules.create({
    scheduleId,
    destination,
    cron,
    method: "POST",
    body: "{}",
    headers: { "Content-Type": "application/json" },
    queueName,
    retries: 5,
    retryDelay: "pow(2, retried) * 1000",
    failureCallback,
    redact: { body: true, header: true },
    label: ["affweb", "production", jobName]
  });
}

console.log(`Configured ${schedules.length} QStash schedules on ${queueName}.`);

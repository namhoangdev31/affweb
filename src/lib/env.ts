import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalBoolean = z.preprocess((value) => {
  if (value === "" || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  return value === "true";
}, z.boolean().optional());

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: optionalUrl.default("http://localhost:3000"),
  NEXT_PUBLIC_BUILD_SHA: optionalString.default("development"),
  REGISTRATION_MODE: z.enum(["invite", "public", "closed"]).default("invite"),

  DATABASE_URL: optionalString,
  DIRECT_URL: optionalString,

  AUTH_SECRET: optionalString,
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,
  AUTH_RESEND_KEY: optionalString,
  EMAIL_FROM: optionalString,
  ADMIN_EMAIL_ALLOWLIST: optionalString,

  SHOPEE_AFFILIATE_ID: optionalString,
  SHOPEE_APP_ID: optionalString,
  SHOPEE_APP_SECRET: optionalString,
  SHOPEE_OPEN_API_ENABLED: optionalBoolean.default(false),
  SHOPEE_FOOD_CASHBACK_ENABLED: optionalBoolean.default(false),

  ADDLIVETAG_ENABLED: optionalBoolean.default(false),
  ADDLIVETAG_CONVERSION_ENABLED: optionalBoolean.default(false),
  ADDLIVETAG_API_KEY: optionalString,
  ADDLIVETAG_ACCOUNT_ID: optionalString,
  ADDLIVETAG_API_BASE_URL: optionalUrl.default("https://addlivetag.com/api/v1/conversions.php"),
  ADDLIVETAG_PRODUCT_DATA_URL: optionalUrl.default(
    "https://data.addlivetag.com/product-data/product-data.php"
  ),
  ADDLIVETAG_DEALS_URL: optionalUrl.default("https://addlivetag.com/api/data_dealxk.php"),

  ACCESSTRADE_ENABLED: optionalBoolean.default(false),
  ACCESSTRADE_API_KEY: optionalString,
  ACCESSTRADE_PUBLISHER_ID: optionalString,
  ACCESSTRADE_API_BASE_URL: optionalUrl.default("https://api.accesstrade.vn"),

  LAZADA_MODE: z
    .enum(["disabled", "credential_ready", "shadow", "active"])
    .default("credential_ready"),
  LAZADA_AFFILIATE_ID: optionalString,
  LAZADA_LITE_APP_KEY: optionalString,
  LAZADA_LITE_APP_SECRET: optionalString,
  LAZADA_USER_TOKEN: optionalString,
  LAZADA_API_BASE_URL: optionalUrl.default("https://api.lazada.vn/rest"),
  LAZADA_LINK_OPERATION: optionalString.default("/marketing/link/generate"),
  LAZADA_PRODUCT_OPERATION: optionalString.default("/marketing/product/search"),
  LAZADA_CONVERSION_OPERATION: optionalString.default("/marketing/conversion/report"),

  PAYOS_PAYOUT_ENABLED: optionalBoolean.default(false),
  PAYOS_CLIENT_ID: optionalString,
  PAYOS_API_KEY: optionalString,
  PAYOS_CHECKSUM_KEY: optionalString,

  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  QSTASH_TOKEN: optionalString,
  QSTASH_CURRENT_SIGNING_KEY: optionalString,
  QSTASH_NEXT_SIGNING_KEY: optionalString,
  CRON_SECRET: optionalString,

  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: optionalString,

  BANK_DATA_ENCRYPTION_KEY_V1: optionalString,
  AWS_ROLE_ARN: optionalString,
  AWS_REGION: optionalString.default("ap-southeast-1"),
  EVIDENCE_BUCKET: optionalString,
  EVIDENCE_OBJECT_LOCK_DAYS: z.coerce.number().int().positive().default(2555),

  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  SENTRY_DSN: optionalUrl,
  SENTRY_AUTH_TOKEN: optionalString,
  SENTRY_ORG: optionalString,
  SENTRY_PROJECT: optionalString
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function loadServerEnv(): ServerEnv {
  cachedEnv ??= serverEnvSchema.parse(process.env);
  return cachedEnv;
}

export function hasDatabase(env = loadServerEnv()): boolean {
  return Boolean(env.DATABASE_URL);
}

export function adminEmailAllowlist(env = loadServerEnv()): Set<string> {
  return new Set(
    (env.ADMIN_EMAIL_ALLOWLIST ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function productionReadinessIssues(env = loadServerEnv()): string[] {
  const issues: string[] = [];
  const requiredCore: Array<[keyof ServerEnv, string]> = [
    ["APP_BASE_URL", "APP_BASE_URL"],
    ["DATABASE_URL", "DATABASE_URL"],
    ["DIRECT_URL", "DIRECT_URL"],
    ["AUTH_SECRET", "AUTH_SECRET"],
    ["BANK_DATA_ENCRYPTION_KEY_V1", "BANK_DATA_ENCRYPTION_KEY_V1"]
  ];

  for (const [key, label] of requiredCore) {
    if (!env[key]) issues.push(`${label} is required.`);
  }
  if (!env.NEXT_PUBLIC_BUILD_SHA || env.NEXT_PUBLIC_BUILD_SHA === "development") {
    issues.push("NEXT_PUBLIC_BUILD_SHA must identify the immutable release commit.");
  }
  if (env.AUTH_SECRET && Buffer.byteLength(env.AUTH_SECRET) < 32) {
    issues.push("AUTH_SECRET must contain at least 32 bytes.");
  }
  if (env.BANK_DATA_ENCRYPTION_KEY_V1) {
    try {
      if (Buffer.from(env.BANK_DATA_ENCRYPTION_KEY_V1, "base64").length !== 32) {
        issues.push("BANK_DATA_ENCRYPTION_KEY_V1 must be a base64-encoded 32-byte key.");
      }
    } catch {
      issues.push("BANK_DATA_ENCRYPTION_KEY_V1 is not valid base64.");
    }
  }

  if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) {
    issues.push("Google OAuth credentials are required.");
  }
  if (!env.AUTH_RESEND_KEY || !env.EMAIL_FROM) {
    issues.push("Resend magic-link credentials are required.");
  }
  if (!env.SHOPEE_AFFILIATE_ID) {
    issues.push("SHOPEE_AFFILIATE_ID is required.");
  }
  if (
    !env.ADDLIVETAG_ENABLED ||
    !env.ADDLIVETAG_CONVERSION_ENABLED ||
    !env.ADDLIVETAG_API_KEY ||
    !env.ADDLIVETAG_ACCOUNT_ID
  ) {
    issues.push("AddLiveTag account conversion sync must be fully configured and enabled.");
  }
  if (
    !env.ACCESSTRADE_ENABLED ||
    !env.ACCESSTRADE_API_KEY ||
    !env.ACCESSTRADE_API_BASE_URL ||
    !env.ACCESSTRADE_PUBLISHER_ID
  ) {
    issues.push("AccessTrade publisher integration must be fully configured and enabled.");
  }
  if (
    env.LAZADA_MODE === "active" &&
    (!env.LAZADA_AFFILIATE_ID ||
      !env.LAZADA_LITE_APP_KEY ||
      !env.LAZADA_LITE_APP_SECRET ||
      !env.LAZADA_USER_TOKEN)
  ) {
    issues.push("All Lazada credentials are required in active mode.");
  }
  if (
    !env.PAYOS_PAYOUT_ENABLED ||
    !env.PAYOS_CLIENT_ID ||
    !env.PAYOS_API_KEY ||
    !env.PAYOS_CHECKSUM_KEY
  ) {
    issues.push(
      "payOS Payout credentials must be configured; the database kill switch remains authoritative."
    );
  }
  if (
    Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) !==
    Boolean(env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT)
  ) {
    issues.push("VAPID public/private keys and subject must be configured together.");
  }
  if (
    env.APP_BASE_URL &&
    !env.APP_BASE_URL.startsWith("https://") &&
    env.NODE_ENV === "production"
  ) {
    issues.push("APP_BASE_URL must use HTTPS in production.");
  }
  if (!env.ADMIN_EMAIL_ALLOWLIST) {
    issues.push("ADMIN_EMAIL_ALLOWLIST is required.");
  }
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    issues.push("Upstash Redis credentials are required.");
  }
  if (!env.QSTASH_TOKEN || !env.QSTASH_CURRENT_SIGNING_KEY || !env.QSTASH_NEXT_SIGNING_KEY) {
    issues.push("QStash token and signing keys are required.");
  }
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    issues.push("VAPID configuration is required for production PWA push.");
  }
  if (!env.AWS_ROLE_ARN || !env.EVIDENCE_BUCKET) {
    issues.push("AWS OIDC role and evidence bucket are required.");
  }
  if (!env.SENTRY_DSN || !env.NEXT_PUBLIC_SENTRY_DSN) {
    issues.push("Server and public Sentry DSNs are required.");
  }
  if (!env.SENTRY_AUTH_TOKEN || !env.SENTRY_ORG || !env.SENTRY_PROJECT) {
    issues.push("Sentry auth token, organization and project are required for source maps.");
  }

  return issues;
}

export function resetEnvCacheForTests(): void {
  cachedEnv = undefined;
}

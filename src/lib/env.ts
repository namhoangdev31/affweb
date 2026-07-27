import { z } from "zod";

const emptyToUndefined = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  let trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (trimmed.startsWith("${") && trimmed.endsWith("}")) {
    const varName = trimmed.slice(2, -1);
    const envVal = process.env[varName];
    if (envVal && envVal !== value) {
      trimmed = envVal.trim();
    } else {
      return undefined;
    }
  }
  return trimmed === "" ? undefined : trimmed;
};

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess((val) => {
  const cleaned = emptyToUndefined(val);
  if (!cleaned) return undefined;
  try {
    new URL(cleaned);
    return cleaned;
  } catch {
    return undefined;
  }
}, z.url().optional());
const optionalBoolean = z.preprocess((value) => {
  const cleaned = emptyToUndefined(value);
  if (cleaned === undefined) return undefined;
  if (typeof value === "boolean") return value;
  return cleaned === "true";
}, z.boolean().optional());

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: optionalUrl.default("http://localhost:3000"),
  NEXT_PUBLIC_BUILD_SHA: optionalString.default("development"),
  REGISTRATION_MODE: z.enum(["invite", "public", "closed"]).default("invite"),

  DATABASE_URL: optionalString,
  DIRECT_URL: optionalString,
  DATABASE_URL_UNPOOLED: optionalString,

  CLERK_APPLICATION_ID: optionalString,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  CLERK_SECRET_KEY: optionalString,
  CLERK_WEBHOOK_SIGNING_SECRET: optionalString,
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: optionalString.default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: optionalString.default("/sign-up"),
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: optionalString.default("/app"),
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: optionalString.default("/app"),
  WEBAUTHN_CHALLENGE_SECRET: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  ADMIN_EMAIL_ALLOWLIST: optionalString,

  SHOPEE_AFFILIATE_ID: optionalString,
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
  PAYOS_WEBHOOK_URL: optionalUrl,

  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  KV_REST_API_URL: optionalUrl,
  KV_REST_API_TOKEN: optionalString,
  QSTASH_TOKEN: optionalString,
  QSTASH_CURRENT_SIGNING_KEY: optionalString,
  QSTASH_NEXT_SIGNING_KEY: optionalString,
  QSTASH_URL: optionalUrl.default("https://qstash-us-east-1.upstash.io"),
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
    ["CLERK_APPLICATION_ID", "CLERK_APPLICATION_ID"],
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    ["CLERK_SECRET_KEY", "CLERK_SECRET_KEY"],
    ["CLERK_WEBHOOK_SIGNING_SECRET", "CLERK_WEBHOOK_SIGNING_SECRET"],
    ["WEBAUTHN_CHALLENGE_SECRET", "WEBAUTHN_CHALLENGE_SECRET"],
    ["BANK_DATA_ENCRYPTION_KEY_V1", "BANK_DATA_ENCRYPTION_KEY_V1"]
  ];

  for (const [key, label] of requiredCore) {
    if (!env[key]) issues.push(`${label} is required.`);
  }
  if (!env.DIRECT_URL && !env.DATABASE_URL_UNPOOLED) {
    issues.push("DIRECT_URL or DATABASE_URL_UNPOOLED is required.");
  }
  if (!env.NEXT_PUBLIC_BUILD_SHA || env.NEXT_PUBLIC_BUILD_SHA === "development") {
    issues.push("NEXT_PUBLIC_BUILD_SHA must identify the immutable release commit.");
  }
  if (
    env.CLERK_APPLICATION_ID &&
    env.CLERK_APPLICATION_ID !== "app_3GxTUr7hRQ5aU7hJX2kz7DWGu6U"
  ) {
    issues.push("CLERK_APPLICATION_ID must be app_3GxTUr7hRQ5aU7hJX2kz7DWGu6U.");
  }
  if (
    env.WEBAUTHN_CHALLENGE_SECRET &&
    Buffer.byteLength(env.WEBAUTHN_CHALLENGE_SECRET) < 32
  ) {
    issues.push("WEBAUTHN_CHALLENGE_SECRET must contain at least 32 bytes.");
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

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    issues.push("Resend notification credentials are required.");
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
  if (
    !(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) &&
    !(env.KV_REST_API_URL && env.KV_REST_API_TOKEN)
  ) {
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

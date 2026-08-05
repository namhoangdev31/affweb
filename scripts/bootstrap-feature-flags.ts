import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PLAN_PRESETS } from "../src/lib/tenant-config";

dotenv.config({ path: ".env.local" });
dotenv.config();

const rawConnectionString =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/affweb";

const connectionString = rawConnectionString.includes("sslmode=require")
  ? rawConnectionString.replace(/sslmode=require/g, "sslmode=verify-full")
  : rawConnectionString;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});

const DEFAULT_FLAGS = [
  {
    key: "saas.billing.enabled",
    enabled: true,
    description: "Enable SaaS Billing PayOS Checkout and invoice processing"
  },
  {
    key: "payout.enabled",
    enabled: false,
    description: "Legacy core payout kill switch; remains disabled after tenant finance cutover"
  },
  {
    key: "tenant.finance.enabled",
    enabled: false,
    description: "Enable tenant financial ledger commands"
  },
  {
    key: "tenant.payout_request.enabled",
    enabled: false,
    description: "Enable tenant member payout requests"
  },
  {
    key: "tenant.payout_approval.enabled",
    enabled: false,
    description: "Enable tenant member payout approval"
  },
  {
    key: "tenant.treasury_withdrawal.enabled",
    enabled: false,
    description: "Enable tenant treasury withdrawal requests"
  },
  {
    key: "tenant.manual_payout.enabled",
    enabled: false,
    description: "Enable request-driven manual tenant payouts"
  },
  {
    key: "tenant.auto_payout.enabled",
    enabled: false,
    description: "Enable internal PayOS execution after tenant payout approval"
  },
  {
    key: "tenant.auto_reconciliation.enabled",
    enabled: false,
    description: "Enable finite provider reconciliation"
  },
  {
    key: "qstash.recovery.enabled",
    enabled: false,
    description: "Enable record-scoped QStash finance recovery"
  },
  {
    key: "tenant.zalo_wallet.enabled",
    enabled: false,
    description: "Enable tenant wallet lookup through bound Zalo identities"
  },
  {
    key: "tenant.zalo_payout.enabled",
    enabled: false,
    description: "Enable tenant payout confirmation links from Zalo"
  },
  {
    key: "zalo.bot.enabled",
    enabled: true,
    description: "Enable Zalo Bot group link binding and automated replies"
  },
  {
    key: "provider.credentials.enabled",
    enabled: true,
    description: "Enable custom Lazada & AccessTrade provider API credentials"
  }
];

export async function bootstrapFeatureFlags(): Promise<void> {
  console.log("Bootstrapping default feature flags...");
  for (const flag of DEFAULT_FLAGS) {
    const result = await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: {
        key: flag.key,
        enabled: flag.enabled,
        description: flag.description
      },
      update: {
        enabled: flag.enabled,
        description: flag.description
      }
    });
    console.log(`✓ Feature flag '${result.key}' is now set to enabled=${result.enabled}`);
  }
  for (const [code, preset] of Object.entries(PLAN_PRESETS)) {
    const isYearly = code.endsWith("_YEARLY");
    const isTrial = code === "TRIAL_14D";
    const priceVnd = BigInt(isYearly ? preset.priceYearly : preset.priceMonthly);
    const durationDays = isTrial ? 14 : isYearly ? 365 : 30;
    const billingCycle = isTrial ? "TRIAL" : isYearly ? "YEARLY" : "MONTHLY";

    await prisma.subscriptionPlan.upsert({
      where: { code },
      create: {
        code,
        name: preset.name,
        priceVnd,
        priceMonthly: preset.priceMonthly,
        durationDays,
        billingCycle,
        maxUsers: preset.maxUsers,
        maxClicksPerMonth: preset.maxClicksPerMonth,
        allowCustomDomain: preset.allowCustomDomain,
        allowApiCredentials: true,
        allowZaloBot: true,
        allowedConnectors: preset.allowedConnectors,
        active: true
      },
      update: {
        name: preset.name,
        priceVnd,
        priceMonthly: preset.priceMonthly,
        durationDays,
        billingCycle,
        maxUsers: preset.maxUsers,
        maxClicksPerMonth: preset.maxClicksPerMonth,
        allowCustomDomain: preset.allowCustomDomain,
        allowApiCredentials: true,
        allowZaloBot: true,
        allowedConnectors: preset.allowedConnectors,
        active: true
      }
    });
    console.log(`✓ Subscription plan '${code}' updated with real-world entitlements`);
  }
  console.log("All default feature flags and subscription plans bootstrapped successfully.");
}

bootstrapFeatureFlags()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Failed to bootstrap feature flags:", err);
    await prisma.$disconnect();
    process.exit(1);
  });

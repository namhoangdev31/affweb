import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

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
    enabled: true,
    description: "Enable Payout ticket creation and processing"
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
  const updatedPlans = await prisma.subscriptionPlan.updateMany({
    data: { allowApiCredentials: true }
  });
  console.log(`✓ Updated ${updatedPlans.count} subscription plans with allowApiCredentials=true`);
  console.log("All default feature flags bootstrapped successfully.");
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

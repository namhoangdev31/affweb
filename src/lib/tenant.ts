import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createPayOSPaymentLink } from "@/lib/payos";
import { PLAN_PRESETS } from "./tenant-config";

export * from "./tenant-config";

/**
 * Resolves a tenant by slug (e.g., /t/sansale-koc)
 */
export async function getTenantBySlug(slug: string) {
  if (!slug) return null;
  return db.tenant.findUnique({
    where: { slug: slug.toLowerCase().trim() }
  });
}

/**
 * Resolves a tenant by slug or custom domain
 */
export async function getTenantByHost(host: string) {
  const cleanHost = host.split(":")[0]?.toLowerCase() || "";

  // Check custom domain first
  let tenant = await db.tenant.findUnique({
    where: { customDomain: cleanHost }
  });

  if (tenant) return tenant;

  // Check subdomain (e.g. branda.affweb.vn -> slug = branda)
  const parts = cleanHost.split(".");
  if (parts.length >= 3 || (parts.length === 2 && cleanHost.endsWith(".localhost"))) {
    const slug = parts[0];
    if (slug && slug !== "admin" && slug !== "www" && slug !== "app") {
      tenant = await db.tenant.findUnique({
        where: { slug }
      });
    }
  }

  return tenant;
}

/**
 * Registers a new tenant with a 14-day free trial
 */
export async function registerTenantWithTrial(
  params: {
    slug: string;
    name: string;
    ownerUserId: string;
    shopeeAffiliateId: string;
    memberShareBps: number;
  },
  client: Prisma.TransactionClient | typeof db = db
) {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

  const tenant = await client.tenant.create({
    data: {
      slug: params.slug.toLowerCase().trim(),
      name: params.name,
      status: "TRIAL",
      isTrial: true,
      planId: "TRIAL_14D",
      trialEndsAt,
      planExpiresAt: trialEndsAt,
      ownerUserId: params.ownerUserId,
      shopeeAffiliateId: params.shopeeAffiliateId,
      memberShareBps: params.memberShareBps
    }
  });

  return tenant;
}

/**
 * Creates a PayOS Checkout session for package renewal / upgrade
 */
export async function createTenantCheckoutSession(params: {
  tenantId: string;
  planCode: string;
  billingCycle?: "monthly" | "yearly";
  baseUrl: string;
}) {
  const tenant = await db.tenant.findUnique({
    where: { id: params.tenantId }
  });

  if (!tenant) throw new Error("Tenant not found");

  const plan = PLAN_PRESETS[params.planCode];
  if (!plan) throw new Error("Invalid Plan Code");

  const isYearly = params.billingCycle === "yearly" || params.planCode.endsWith("_YEARLY");
  const amount = isYearly ? plan.priceYearly : plan.priceMonthly;

  // Generate numeric 6-digit order code for PayOS
  const orderCode = Math.floor(100000 + Math.random() * 900000);

  const invoice = await db.saaSInvoice.create({
    data: {
      tenantId: tenant.id,
      orderCode,
      amount,
      description: `Gia han ${plan.name} (${isYearly ? "1 Nam" : "1 Thang"}) - ${tenant.slug}`,
      planCode: plan.code,
      status: "PENDING"
    }
  });

  const payosResult = await createPayOSPaymentLink({
    orderCode: invoice.orderCode,
    amount,
    description: `Thanh toan ${plan.code}`,
    returnUrl: `${params.baseUrl}/app/settings/tenant?status=success`,
    cancelUrl: `${params.baseUrl}/app/settings/tenant?status=cancelled`
  });

  if (payosResult.data?.paymentLinkId) {
    await db.saaSInvoice.update({
      where: { id: invoice.id },
      data: { paymentLinkId: payosResult.data.paymentLinkId }
    });
  }

  return {
    invoice,
    checkoutUrl: payosResult.data?.checkoutUrl,
    qrCode: payosResult.data?.qrCode
  };
}

/**
 * Checks if tenant user limit has been reached
 */
export async function checkTenantUserQuota(tenantId: string): Promise<{
  allowed: boolean;
  currentCount: number;
  maxUsers: number;
}> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) return { allowed: true, currentCount: 0, maxUsers: Infinity };

  const plan = PLAN_PRESETS[tenant.planId] ?? PLAN_PRESETS.TRIAL_14D;
  const maxUsers = plan?.maxUsers ?? 100;
  const currentCount = await db.user.count({
    where: { tenantId }
  });

  return {
    allowed: currentCount < maxUsers,
    currentCount,
    maxUsers
  };
}

/**
 * Checks if tenant can use a specific Connector
 */
export async function canTenantUseConnector(
  tenantId: string,
  connectorType: string
): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) return true;

  const plan = PLAN_PRESETS[tenant.planId] ?? PLAN_PRESETS.TRIAL_14D;
  return plan?.allowedConnectors?.includes(connectorType) ?? false;
}

/**
 * Checks if tenant can configure Custom Domain
 */
export async function canTenantUseCustomDomain(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) return false;

  const plan = PLAN_PRESETS[tenant.planId] ?? PLAN_PRESETS.TRIAL_14D;
  return plan?.allowCustomDomain ?? false;
}

/**
 * Checks if tenant can configure Custom Affiliate Credentials
 */
export async function canTenantUseCustomCredentials(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) return false;

  const plan = PLAN_PRESETS[tenant.planId] ?? PLAN_PRESETS.TRIAL_14D;
  return plan?.allowApiCredentials ?? false;
}

/**
 * Checks if tenant can configure Zalo Bot Integration
 */
export async function canTenantUseZaloBot(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) return false;

  const plan = PLAN_PRESETS[tenant.planId] ?? PLAN_PRESETS.TRIAL_14D;
  return plan?.allowZaloBot ?? false;
}

/**
 * Retrieves a full feature summary & quota status for a tenant
 */
export async function getTenantFeatureSummary(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) return null;

  const plan = PLAN_PRESETS[tenant.planId] ?? PLAN_PRESETS.TRIAL_14D;
  if (!plan) return null;

  const userCount = await db.user.count({ where: { tenantId } });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const clickCount = await db.affiliateClick.count({
    where: {
      tenantId,
      createdAt: { gte: startOfMonth }
    }
  });

  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    planCode: plan.code,
    planName: plan.name,
    isTrial: tenant.isTrial,
    status: tenant.status,
    userQuota: {
      used: userCount,
      max: plan.maxUsers,
      exceeded: userCount >= plan.maxUsers
    },
    clickQuota: {
      used: clickCount,
      max: plan.maxClicksPerMonth,
      exceeded: clickCount >= plan.maxClicksPerMonth
    },
    features: {
      allowCustomDomain: plan.allowCustomDomain,
      allowApiCredentials: plan.allowApiCredentials,
      allowZaloBot: plan.allowZaloBot,
      allowedConnectors: plan.allowedConnectors
    }
  };
}

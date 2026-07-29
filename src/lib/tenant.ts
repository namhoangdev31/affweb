import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createPayOSPaymentLink } from "@/lib/payos";
import { featureEnabled } from "@/modules/flags/service";
import { requireTenantPlan, tenantSubscriptionIsEffective } from "@/modules/tenants/plans";

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
      planCode: "TRIAL_14D",
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
  baseUrl: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  if (!(await featureEnabled("saas.billing.enabled", true))) {
    throw new AppError("CONNECTOR_DISABLED", "Thanh toán SaaS đang tạm dừng.", 503);
  }
  const tenant = await db.tenant.findUnique({
    where: { id: params.tenantId }
  });

  if (!tenant) throw new AppError("NOT_FOUND", "Tenant không tồn tại.", 404);
  if (tenant.status === "CLOSED" || tenant.status === "SUSPENDED") {
    throw new AppError("FORBIDDEN", "Tenant không thể tạo thanh toán ở trạng thái hiện tại.", 403);
  }

  const existing = await db.saaSInvoice.findFirst({
    where: { tenantId: tenant.id, clientIdempotencyKey: params.idempotencyKey }
  });
  if (existing) {
    if (existing.requestHash !== params.requestHash) {
      throw new AppError("CONFLICT", "Idempotency-Key đã được dùng với dữ liệu khác.", 409);
    }
    return {
      invoice: existing,
      checkoutUrl: existing.checkoutUrl,
      qrCode: existing.qrCode
    };
  }

  const plan = await requireTenantPlan(params.planCode);
  if (plan.billingCycle === "TRIAL" || plan.priceVnd <= 0n) {
    throw new AppError("VALIDATION_ERROR", "Không thể checkout gói dùng thử.", 400);
  }
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const description = `Thanh toan ${plan.code}`.slice(0, 25);
  let invoice;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sequenceRows = await db.$queryRaw<Array<{ orderCode: bigint }>>`
      SELECT nextval('"SaaSInvoice_order_code_seq"') AS "orderCode"
    `;
    const orderCodeValue = sequenceRows[0]?.orderCode;
    if (!orderCodeValue || orderCodeValue > 2_000_000_000n) {
      throw new AppError("INTERNAL_ERROR", "Dải mã thanh toán PayOS đã hết.", 500);
    }
    const orderCode = Number(orderCodeValue);
    try {
      invoice = await db.saaSInvoice.create({
        data: {
          tenantId: tenant.id,
          orderCode,
          amount: 0,
          amountVnd: plan.priceVnd,
          description,
          planCode: plan.code,
          durationDays: plan.durationDays,
          planSnapshot: {
            code: plan.code,
            name: plan.name,
            priceVnd: plan.priceVnd.toString(),
            durationDays: plan.durationDays,
            billingCycle: plan.billingCycle,
            maxUsers: plan.maxUsers,
            maxClicksPerMonth: plan.maxClicksPerMonth,
            allowZaloBot: plan.allowZaloBot,
            allowedConnectors: plan.allowedConnectors
          },
          clientIdempotencyKey: params.idempotencyKey,
          requestHash: params.requestHash,
          expiresAt,
          status: "PENDING"
        }
      });
      break;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      const concurrent = await db.saaSInvoice.findFirst({
        where: { tenantId: tenant.id, clientIdempotencyKey: params.idempotencyKey }
      });
      if (concurrent) {
        if (concurrent.requestHash !== params.requestHash) {
          throw new AppError("CONFLICT", "Idempotency-Key đã được dùng với dữ liệu khác.", 409);
        }
        if (!concurrent.checkoutUrl || !concurrent.qrCode) {
          throw new AppError("CONFLICT", "Payment link đang được khởi tạo, vui lòng thử lại.", 409);
        }
        return {
          invoice: concurrent,
          checkoutUrl: concurrent.checkoutUrl,
          qrCode: concurrent.qrCode
        };
      }
      if (attempt === 2) throw error;
    }
  }
  if (!invoice) {
    throw new AppError("INTERNAL_ERROR", "Không thể cấp mã thanh toán.", 500);
  }

  let payosResult;
  try {
    payosResult = await createPayOSPaymentLink({
      orderCode: invoice.orderCode,
      amountVnd: plan.priceVnd,
      description,
      returnUrl: `${params.baseUrl}/app/settings/tenant?invoice=${invoice.id}`,
      cancelUrl: `${params.baseUrl}/app/settings/tenant?invoice=${invoice.id}`,
      expiresAt
    });
  } catch (error) {
    await db.saaSInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "FAILED",
        failureCode: error instanceof AppError ? error.code : "CONNECTOR_UNAVAILABLE",
        failureMessage: "Không thể tạo payment link PayOS."
      }
    });
    throw error;
  }

  const updatedInvoice = await db.saaSInvoice.update({
    where: { id: invoice.id },
    data: {
      paymentLinkId: payosResult.paymentLinkId,
      checkoutUrl: payosResult.checkoutUrl,
      qrCode: payosResult.qrCode
    }
  });

  return {
    invoice: updatedInvoice,
    checkoutUrl: payosResult.checkoutUrl,
    qrCode: payosResult.qrCode
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
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });

  if (!tenant) return { allowed: false, currentCount: 0, maxUsers: 0 };

  const plan = await requireTenantPlan(tenant.planCode ?? tenant.planId);
  const maxUsers = plan.maxUsers;
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

  if (!tenant || !tenantSubscriptionIsEffective(tenant)) return false;

  const plan = await requireTenantPlan(tenant.planCode ?? tenant.planId);
  return plan.allowedConnectors.includes(connectorType);
}

/**
 * Checks if tenant can configure Custom Domain
 */
export async function canTenantUseCustomDomain(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) return false;

  const plan = await requireTenantPlan(tenant.planCode ?? tenant.planId);
  return tenantSubscriptionIsEffective(tenant) && plan.allowCustomDomain;
}

/**
 * Checks if tenant can configure Custom Affiliate Credentials
 */
export async function canTenantUseCustomCredentials(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) return false;

  const plan = await requireTenantPlan(tenant.planCode ?? tenant.planId);
  return tenantSubscriptionIsEffective(tenant) && plan.allowApiCredentials;
}

/**
 * Checks if tenant can configure Zalo Bot Integration
 */
export async function canTenantUseZaloBot(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) return false;

  const plan = await requireTenantPlan(tenant.planCode ?? tenant.planId);
  return tenantSubscriptionIsEffective(tenant) && plan.allowZaloBot;
}

/**
 * Retrieves a full feature summary & quota status for a tenant
 */
export async function getTenantFeatureSummary(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) return null;

  const plan = await requireTenantPlan(tenant.planCode ?? tenant.planId);

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
    isTrial: plan.billingCycle === "TRIAL",
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

export async function expireSaaSInvoicesAndTenants(): Promise<{
  expiredInvoices: number;
  pastDueTenants: number;
}> {
  const now = new Date();
  const [expiredInvoices, pastDueTenants] = await db.$transaction([
    db.saaSInvoice.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lte: now }
      },
      data: { status: "EXPIRED" }
    }),
    db.tenant.updateMany({
      where: {
        status: { in: ["TRIAL", "ACTIVE"] },
        planExpiresAt: { lte: now }
      },
      data: { status: "PAST_DUE" }
    })
  ]);
  return {
    expiredInvoices: expiredInvoices.count,
    pastDueTenants: pastDueTenants.count
  };
}

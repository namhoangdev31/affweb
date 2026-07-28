import "server-only";

import type { BillingCycle, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export interface TenantPlanEntitlement {
  code: string;
  name: string;
  priceVnd: bigint;
  durationDays: number;
  billingCycle: BillingCycle;
  maxUsers: number;
  maxClicksPerMonth: number;
  allowCustomDomain: boolean;
  allowApiCredentials: boolean;
  allowZaloBot: boolean;
  allowedConnectors: string[];
}

function parseAllowedConnectors(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AppError("INTERNAL_ERROR", "Plan connector entitlement không hợp lệ.", 500);
  }
  return value.map((item) => item as string);
}

export async function requireTenantPlan(
  code: string,
  client: Prisma.TransactionClient | typeof db = db
): Promise<TenantPlanEntitlement> {
  const plan = await client.subscriptionPlan.findUnique({ where: { code } });
  if (
    !plan ||
    !plan.active ||
    plan.priceVnd === null ||
    plan.durationDays === null ||
    plan.billingCycle === null
  ) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Gói dịch vụ chưa được cấu hình đầy đủ.", 503);
  }
  return {
    code: plan.code,
    name: plan.name,
    priceVnd: plan.priceVnd,
    durationDays: plan.durationDays,
    billingCycle: plan.billingCycle,
    maxUsers: plan.maxUsers,
    maxClicksPerMonth: plan.maxClicksPerMonth,
    allowCustomDomain: plan.allowCustomDomain,
    allowApiCredentials: plan.allowApiCredentials,
    allowZaloBot: plan.allowZaloBot,
    allowedConnectors: parseAllowedConnectors(plan.allowedConnectors)
  };
}

export function tenantSubscriptionIsEffective(input: {
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CLOSED";
  planExpiresAt: Date;
  now?: Date;
}): boolean {
  return (
    (input.status === "TRIAL" || input.status === "ACTIVE") &&
    input.planExpiresAt.getTime() > (input.now ?? new Date()).getTime()
  );
}

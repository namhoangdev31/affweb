import { TenantSettingsClient } from "@/app/app/settings/tenant/tenant-settings-client";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { canTenantUseZaloBot } from "@/lib/tenant";
import { requireTenantPlan } from "@/modules/tenants/plans";
import { requireTenantMasterContext } from "@/modules/tenants/persona";

export default async function ShopTenantSettingsPage({
  params
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId: paramId } = await params;
  const user = await requireUser();
  const tenantObj = await db.tenant.findFirst({
    where: { OR: [{ id: paramId }, { slug: paramId.toLowerCase() }] }
  });
  const context = await requireTenantMasterContext(user.id, tenantObj?.id);
  const tenant = context.ownedTenant!;
  const env = loadServerEnv();
  const [plan, providerAccounts] = await Promise.all([
    requireTenantPlan(tenant.planCode ?? tenant.planId),
    db.affiliateAccount.findMany({
      where: {
        tenantId: tenant.id,
        connectorType: { in: ["LAZADA_OPEN_API", "ACCESSTRADE_API"] }
      },
      orderBy: { createdAt: "asc" }
    })
  ]);
  const zaloAvailable =
    env.ZALO_BOT_ENABLED &&
    Boolean(
      env.ZALO_BOT_TOKEN &&
      env.ZALO_BOT_SECRET_TOKEN &&
      env.ZALO_DATA_ENCRYPTION_KEY_V1 &&
      env.NEXT_PUBLIC_ZALO_BOT_GROUP_INVITE_URL
    ) &&
    (await canTenantUseZaloBot(tenant.id));
  return (
    <TenantSettingsClient
      zaloAvailable={zaloAvailable}
      planAllowsCredentials={plan.allowApiCredentials}
      credentialFeatureEnabled={true}
      providerAccounts={providerAccounts.map((account) => ({
        id: account.id,
        provider: account.connectorType as "LAZADA_OPEN_API" | "ACCESSTRADE_API",
        label: account.label,
        externalAccountId: account.externalAccountId,
        fingerprint: account.fingerprint,
        status: account.verifiedAt ? ("ACTIVE" as const) : ("CREDENTIAL_REQUIRED" as const),
        validationHoldDays: account.validationHoldDays
      }))}
      {...(zaloAvailable && env.NEXT_PUBLIC_ZALO_BOT_GROUP_INVITE_URL
        ? { zaloInviteUrl: env.NEXT_PUBLIC_ZALO_BOT_GROUP_INVITE_URL }
        : {})}
      initialTenant={{
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        isTrial: tenant.isTrial,
        trialEndsAtLabel:
          tenant.trialEndsAt?.toLocaleDateString("vi-VN", { dateStyle: "long" }) ?? null,
        planId: tenant.planId,
        shopeeAffiliateId: tenant.shopeeAffiliateId ?? "",
        memberSharePercent: tenant.memberShareBps === null ? null : tenant.memberShareBps / 100
      }}
    />
  );
}

import { z } from "zod";
import {
  ConnectorMode,
  ConnectorType,
  Platform,
  Prisma,
  ProviderAccountScope
} from "@/generated/prisma/client";
import { requireApiRecentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, readJson, requestId } from "@/lib/request";
import { featureEnabled } from "@/modules/flags/service";
import { requireTenantPlan, tenantSubscriptionIsEffective } from "@/modules/tenants/plans";

export const runtime = "nodejs";

const inputSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal(ConnectorType.LAZADA_OPEN_API),
    externalAccountId: z.string().trim().min(1).max(200),
    label: z.string().trim().min(2).max(120)
  }),
  z.object({
    provider: z.literal(ConnectorType.ACCESSTRADE_API),
    externalAccountId: z.string().trim().min(1).max(200),
    label: z.string().trim().min(2).max(120)
  })
]);

function platformOf(provider: ConnectorType): Platform {
  return provider === ConnectorType.LAZADA_OPEN_API ? Platform.LAZADA : Platform.ACCESSTRADE;
}

export async function POST(request: Request): Promise<Response> {
  const requestIdentifier = await requestId();
  try {
    assertTrustedOrigin(request);
    if (!(await featureEnabled("provider.credentials.enabled", false))) {
      throw new AppError("CONNECTOR_DISABLED", "Provider credentials đang được tắt.", 503);
    }
    const actor = await requireApiRecentUser();
    const limit = await rateLimit(`provider-account-create:${actor.id}`, 5, 3600);
    if (!limit.allowed) {
      throw new AppError("RATE_LIMITED", "Bạn tạo provider account quá nhanh.", 429);
    }
    const input = inputSchema.parse(await readJson(request));
    const tenant = await db.tenant.findUnique({
      where: { ownerUserId: actor.id }
    });
    if (!tenant || !tenantSubscriptionIsEffective(tenant)) {
      throw new AppError("FORBIDDEN", "Bạn không sở hữu tenant đang hoạt động.", 403);
    }
    const plan = await requireTenantPlan(tenant.planCode ?? tenant.planId);
    if (!plan.allowApiCredentials || !plan.allowedConnectors.includes(input.provider)) {
      throw new AppError("FORBIDDEN", "Gói tenant không hỗ trợ provider credential này.", 403);
    }
    const platform = platformOf(input.provider);
    const account = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenant.id} FOR UPDATE`;
        const existingForProvider = await tx.affiliateAccount.findFirst({
          where: {
            tenantId: tenant.id,
            scope: ProviderAccountScope.TENANT_MANAGED,
            connectorType: input.provider,
            platform
          }
        });
        if (existingForProvider) {
          if (existingForProvider.externalAccountId !== input.externalAccountId) {
            throw new AppError(
              "CONFLICT",
              "Tenant đã có provider account khác cho connector này.",
              409
            );
          }
          return existingForProvider;
        }
        const claimedIdentity = await tx.affiliateAccount.findUnique({
          where: {
            connectorType_platform_externalAccountId: {
              connectorType: input.provider,
              platform,
              externalAccountId: input.externalAccountId
            }
          },
          select: { id: true }
        });
        if (claimedIdentity) {
          throw new AppError("CONFLICT", "Provider account identity đã được liên kết.", 409);
        }
        const created = await tx.affiliateAccount.create({
          data: {
            connectorType: input.provider,
            platform,
            externalAccountId: input.externalAccountId,
            label: input.label,
            scope: ProviderAccountScope.TENANT_MANAGED,
            tenantId: tenant.id,
            enabled: false,
            connectorConfigs: {
              create: {
                connectorType: input.provider,
                platform,
                tenantId: tenant.id,
                enabled: false,
                mode: ConnectorMode.CREDENTIAL_READY
              }
            }
          }
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: "provider_account.created",
            entityType: "AffiliateAccount",
            entityId: created.id,
            requestId: requestIdentifier,
            after: {
              provider: input.provider,
              scope: ProviderAccountScope.TENANT_MANAGED,
              tenantId: tenant.id
            }
          }
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return Response.json(
      {
        data: {
          id: account.id,
          provider: account.connectorType,
          label: account.label,
          status: account.verifiedAt ? "ACTIVE" : "CREDENTIAL_REQUIRED",
          fingerprint: account.fingerprint
        }
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-Id": requestIdentifier
        }
      }
    );
  } catch (error) {
    return errorResponse(error, requestIdentifier);
  }
}

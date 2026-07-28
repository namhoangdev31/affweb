import { z } from "zod";
import { Role, ConnectorMode, ProviderAccountScope } from "@/generated/prisma/client";
import { requireApiRecentUser, requireApiRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, readJson, requestId } from "@/lib/request";
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";
import {
  providerCredentialPayloadSchema,
  saveVerifiedProviderCredential
} from "@/modules/connectors/provider-credentials";
import { connectorFor } from "@/modules/connectors/registry";
import { featureEnabled } from "@/modules/flags/service";
import { requireTenantPlan, tenantSubscriptionIsEffective } from "@/modules/tenants/plans";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    if (!(await featureEnabled("provider.credentials.enabled", false))) {
      throw new AppError("CONNECTOR_DISABLED", "Provider credentials đang được tắt.", 503);
    }
    const actor = await requireApiRecentUser();
    const limit = await rateLimit(`provider-credential:${actor.id}`, 5, 60);
    if (!limit.allowed) {
      throw new AppError("RATE_LIMITED", "Bạn thao tác credential quá nhanh.", 429);
    }
    const { id: affiliateAccountId } = await context.params;
    const account = await db.affiliateAccount.findUnique({
      where: { id: affiliateAccountId },
      include: { tenant: true }
    });
    if (!account) {
      throw new AppError("NOT_FOUND", "Provider account không tồn tại.", 404);
    }
    if (account.scope === ProviderAccountScope.PLATFORM_MANAGED) {
      const finance = await requireApiRole([
        Role.FINANCE_REVIEWER,
        Role.FINANCE_APPROVER,
        Role.SUPER_ADMIN
      ]);
      if (finance.id !== actor.id) {
        throw new AppError("FORBIDDEN", "Phiên xác thực không khớp.", 403);
      }
      await requireRecentFinancePasskey(actor.id);
    } else {
      if (
        !account.tenant ||
        account.tenant.ownerUserId !== actor.id ||
        !tenantSubscriptionIsEffective(account.tenant)
      ) {
        throw new AppError("FORBIDDEN", "Bạn không quản lý provider account này.", 403);
      }
      const plan = await requireTenantPlan(account.tenant.planCode ?? account.tenant.planId);
      if (!plan.allowApiCredentials || !plan.allowedConnectors.includes(account.connectorType)) {
        throw new AppError(
          "FORBIDDEN",
          "Gói tenant không có quyền cấu hình provider credential.",
          403
        );
      }
    }
    const body = await readJson<unknown>(request, 16_384);
    const input = providerCredentialPayloadSchema
      .and(z.object({ validationHoldDays: z.number().int().min(4).max(60) }))
      .parse(body);
    const { validationHoldDays, ...credentialInput } = input;
    const credential = providerCredentialPayloadSchema.parse(credentialInput);
    if (credential.provider !== account.connectorType) {
      throw new AppError("VALIDATION_ERROR", "Credential không khớp provider account.", 400);
    }
    const connector = connectorFor(account.platform, credential);
    const health = await connector.healthCheck();
    if (!health.ok) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        "Provider credential preflight không thành công.",
        503
      );
    }
    const saved = await saveVerifiedProviderCredential({
      affiliateAccountId: account.id,
      actorUserId: actor.id,
      payload: credential
    });
    await db.$transaction(async (tx) => {
      await tx.affiliateAccount.update({
        where: { id: account.id },
        data: { validationHoldDays, enabled: true }
      });
      const config = await tx.connectorConfig.upsert({
        where: {
          connectorType_platform_affiliateAccountId: {
            connectorType: account.connectorType,
            platform: account.platform,
            affiliateAccountId: account.id
          }
        },
        create: {
          affiliateAccountId: account.id,
          connectorType: account.connectorType,
          platform: account.platform,
          tenantId: account.tenantId,
          enabled: true,
          mode: ConnectorMode.ACTIVE
        },
        update: {
          tenantId: account.tenantId,
          enabled: true,
          mode: ConnectorMode.ACTIVE
        }
      });
      await tx.connectorHealth.upsert({
        where: { connectorConfigId: config.id },
        create: {
          connectorConfigId: config.id,
          status: ConnectorMode.ACTIVE,
          checkedAt: health.checkedAt,
          lastSuccessAt: health.checkedAt,
          lagSeconds: 0,
          message: "Credential preflight succeeded."
        },
        update: {
          status: ConnectorMode.ACTIVE,
          checkedAt: health.checkedAt,
          lastSuccessAt: health.checkedAt,
          lagSeconds: 0,
          failureCount: 0,
          message: "Credential preflight succeeded."
        }
      });
    });
    return Response.json(
      {
        data: {
          fingerprint: saved.fingerprint,
          version: saved.version,
          status: "ACTIVE",
          verifiedAt: saved.verifiedAt.toISOString(),
          validationHoldDays
        }
      },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": id } }
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

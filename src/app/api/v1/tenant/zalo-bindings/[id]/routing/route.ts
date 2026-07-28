import { z } from "zod";
import { ProviderAccountScope } from "@/generated/prisma/client";
import { requireApiRecentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, readJson, requestId } from "@/lib/request";
import { requireTenantPlan, tenantSubscriptionIsEffective } from "@/modules/tenants/plans";

export const runtime = "nodejs";

const inputSchema = z.discriminatedUnion("routingMode", [
  z.object({
    routingMode: z.literal("DIRECT"),
    accessTradeCampaignId: z.null().optional()
  }),
  z.object({
    routingMode: z.literal("ACCESSTRADE_CAMPAIGN"),
    accessTradeCampaignId: z.string().cuid()
  })
]);

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const requestIdentifier = await requestId();
  try {
    assertTrustedOrigin(request);
    const actor = await requireApiRecentUser();
    const input = inputSchema.parse(await readJson(request));
    const { id } = await context.params;
    const binding = await db.zaloGroupBinding.findUnique({
      where: { id },
      include: { tenant: true }
    });
    if (
      !binding ||
      binding.tenant.ownerUserId !== actor.id ||
      !tenantSubscriptionIsEffective(binding.tenant)
    ) {
      throw new AppError("FORBIDDEN", "Bạn không quản lý Zalo binding này.", 403);
    }
    const plan = await requireTenantPlan(binding.tenant.planCode ?? binding.tenant.planId);
    if (!plan.allowZaloBot) {
      throw new AppError("FORBIDDEN", "Gói tenant không hỗ trợ Zalo Bot.", 403);
    }
    if (input.routingMode === "ACCESSTRADE_CAMPAIGN") {
      if (!plan.allowApiCredentials || !plan.allowedConnectors.includes("ACCESSTRADE_API")) {
        throw new AppError("FORBIDDEN", "Gói tenant không hỗ trợ AccessTrade credential.", 403);
      }
      const [campaign, account] = await Promise.all([
        db.campaign.findFirst({
          where: {
            id: input.accessTradeCampaignId,
            active: true,
            merchant: { active: true, platform: "ACCESSTRADE" }
          }
        }),
        db.affiliateAccount.findFirst({
          where: {
            tenantId: binding.tenantId,
            scope: ProviderAccountScope.TENANT_MANAGED,
            connectorType: "ACCESSTRADE_API",
            platform: "ACCESSTRADE",
            enabled: true,
            verifiedAt: { not: null },
            connectorConfigs: {
              some: { enabled: true, mode: "ACTIVE" }
            }
          }
        })
      ]);
      if (!campaign || !account) {
        throw new AppError(
          "CONNECTOR_UNAVAILABLE",
          "Campaign hoặc tenant AccessTrade credential chưa sẵn sàng.",
          503
        );
      }
    }
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.zaloGroupBinding.update({
        where: { id: binding.id },
        data: {
          routingMode: input.routingMode,
          accessTradeCampaignId:
            input.routingMode === "ACCESSTRADE_CAMPAIGN" ? input.accessTradeCampaignId : null
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: "zalo.group.routing_updated",
          entityType: "ZaloGroupBinding",
          entityId: binding.id,
          requestId: requestIdentifier,
          before: {
            routingMode: binding.routingMode,
            accessTradeCampaignId: binding.accessTradeCampaignId
          },
          after: {
            routingMode: result.routingMode,
            accessTradeCampaignId: result.accessTradeCampaignId
          }
        }
      });
      return result;
    });
    return Response.json(
      {
        data: {
          id: updated.id,
          routingMode: updated.routingMode,
          accessTradeCampaignId: updated.accessTradeCampaignId
        }
      },
      {
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

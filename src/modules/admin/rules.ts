import "server-only";

import { RuleScope } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export async function createRuleVersion(input: {
  scope: RuleScope;
  shareBps: number;
  reason: string;
  createdById: string;
  userId?: string;
  merchantId?: string;
  campaignId?: string;
}) {
  if (!Number.isInteger(input.shareBps) || input.shareBps < 0 || input.shareBps > 10_000) {
    throw new AppError("VALIDATION_ERROR", "Tỷ lệ phải từ 0 đến 10000 basis points.", 400);
  }
  if (input.reason.trim().length < 8) {
    throw new AppError("VALIDATION_ERROR", "Lý do thay đổi quá ngắn.", 400);
  }
  const expected = {
    [RuleScope.USER_CAMPAIGN]: Boolean(input.userId && input.merchantId && input.campaignId),
    [RuleScope.USER_MERCHANT]: Boolean(input.userId && input.merchantId && !input.campaignId),
    [RuleScope.USER_GLOBAL]: Boolean(input.userId && !input.merchantId && !input.campaignId),
    [RuleScope.MERCHANT_DEFAULT]: Boolean(!input.userId && input.merchantId && !input.campaignId),
    [RuleScope.SYSTEM_DEFAULT]: Boolean(!input.userId && !input.merchantId && !input.campaignId)
  };
  if (!expected[input.scope]) {
    throw new AppError("VALIDATION_ERROR", "Scope và target của rule không khớp.", 400);
  }
  return db.$transaction(async (tx) => {
    let rule = await tx.commissionRule.findFirst({
      where: {
        scope: input.scope,
        userId: input.userId ?? null,
        merchantId: input.merchantId ?? null,
        campaignId: input.campaignId ?? null,
        active: true
      },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } }
    });
    if (!rule) {
      rule = await tx.commissionRule.create({
        data: {
          scope: input.scope,
          userId: input.userId ?? null,
          merchantId: input.merchantId ?? null,
          campaignId: input.campaignId ?? null
        },
        include: { versions: { take: 1 } }
      });
    }
    const version = await tx.commissionRuleVersion.create({
      data: {
        ruleId: rule.id,
        version: (rule.versions[0]?.version ?? 0) + 1,
        shareBps: input.shareBps,
        validFrom: new Date(),
        reason: input.reason.trim(),
        createdById: input.createdById
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.createdById,
        action: "commission_rule.version_created",
        entityType: "CommissionRuleVersion",
        entityId: version.id,
        after: {
          scope: input.scope,
          shareBps: input.shareBps,
          version: version.version,
          reason: input.reason.trim()
        }
      }
    });
    return version;
  });
}

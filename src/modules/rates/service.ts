import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { chooseRate } from "@/modules/rates/precedence";

type DbClient = Prisma.TransactionClient | typeof db;

export async function resolveCommissionRate(
  input: {
    userId: string;
    merchantId: string;
    campaignId?: string | null;
    at?: Date;
    merchantDefaultShareBps: number;
  },
  client: DbClient = db
): Promise<{
  shareBps: number;
  ruleVersionId?: string;
  source: string;
}> {
  const at = input.at ?? new Date();
  const versions = await client.commissionRuleVersion.findMany({
    where: {
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
      rule: {
        active: true,
        OR: [
          {
            scope: "USER_CAMPAIGN",
            userId: input.userId,
            merchantId: input.merchantId,
            campaignId: input.campaignId ?? "__none__"
          },
          {
            scope: "USER_MERCHANT",
            userId: input.userId,
            merchantId: input.merchantId
          },
          { scope: "USER_GLOBAL", userId: input.userId },
          { scope: "SYSTEM_DEFAULT" }
        ]
      }
    },
    include: { rule: true }
  });
  const selected = chooseRate(
    versions.map((version) => ({
      id: version.id,
      scope: version.rule.scope,
      shareBps: version.shareBps,
      validFrom: version.validFrom,
      validTo: version.validTo
    })),
    at
  );

  if (selected) {
    return {
      shareBps: selected.shareBps,
      ruleVersionId: selected.id,
      source: selected.scope
    };
  }
  return {
    shareBps: input.merchantDefaultShareBps,
    source: "MERCHANT_DEFAULT"
  };
}

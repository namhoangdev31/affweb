import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  ConnectorType,
  EvidenceAuthority,
  LedgerTransactionType,
  Platform,
  UserStatus
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ingestConversion } from "@/modules/conversions/service";
import { createFinanceSettlementBatch } from "@/modules/settlement/service";

describe("finance settlement release", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("releases once under concurrent replay and reverses with compensating journal", async () => {
    const suffix = randomUUID();
    const user = await db.user.create({
      data: {
        email: `settlement-user-${suffix}@example.test`,
        status: UserStatus.ACTIVE
      }
    });
    const finance = await db.user.create({
      data: {
        email: `settlement-finance-${suffix}@example.test`,
        status: UserStatus.ACTIVE
      }
    });
    const merchant = await db.merchant.create({
      data: {
        platform: Platform.ACCESSTRADE,
        code: `settlement-${suffix}`,
        slug: `settlement-${suffix}`,
        name: "AccessTrade settlement fixture",
        defaultShareBps: 5_000
      }
    });
    const account = await db.affiliateAccount.create({
      data: {
        connectorType: ConnectorType.ACCESSTRADE_API,
        platform: Platform.ACCESSTRADE,
        externalAccountId: `settlement-${suffix}`,
        label: "Platform AccessTrade fixture",
        validationHoldDays: 30,
        fingerprint: `fixture-${suffix}`
      }
    });
    const click = await db.affiliateClick.create({
      data: {
        clickToken: `settlement-click-${suffix}`,
        userId: user.id,
        merchantId: merchant.id,
        affiliateAccountId: account.id,
        platform: Platform.ACCESSTRADE,
        targetType: "OFFER",
        originUrl: "https://merchant.example.test/product",
        outboundUrl: "https://tracking.accesstrade.vn/fixture",
        subIds: [`settlement-click-${suffix}`],
        attribution: {
          create: {
            merchantId: merchant.id,
            shareBps: 5_000,
            snapshot: { source: "integration-fixture" }
          }
        }
      }
    });
    const externalOrderId = `settlement-order-${suffix}`;
    const externalItemKey = "line-1";
    const created = await ingestConversion({
      source: ConnectorType.ACCESSTRADE_API,
      authority: EvidenceAuthority.AUTHORITATIVE,
      platform: Platform.ACCESSTRADE,
      affiliateAccount: account,
      conversion: {
        externalOrderId,
        externalItemKey,
        clickToken: click.clickToken,
        purchasedAt: new Date(),
        grossCommissionVnd: 10_000n,
        netCommissionVnd: 10_000n,
        status: "validated",
        items: [],
        payload: { fixture: true }
      }
    });
    const idempotencyKey = `settlement:${suffix}`;
    const settlement = {
      actorUserId: finance.id,
      idempotencyKey,
      requestHash: suffix.replaceAll("-", ""),
      settlement: {
        affiliateAccountId: account.id,
        externalReference: `finance-period-${suffix}`,
        totalAmountVnd: "10000",
        reason: "Verified provider settlement integration fixture.",
        lines: [{ externalOrderId, externalItemKey, amountVnd: "10000" }],
        evidence: { fixture: true }
      }
    };

    const [first, replay] = await Promise.all([
      createFinanceSettlementBatch(settlement),
      createFinanceSettlementBatch(settlement)
    ]);

    expect(replay.id).toBe(first.id);
    expect(await db.settlementBatch.count({ where: { idempotencyKey } })).toBe(1);
    expect(
      await db.ledgerTransaction.count({
        where: {
          reference: created.conversionId,
          type: LedgerTransactionType.CASHBACK_RELEASE
        }
      })
    ).toBe(1);
    expect(
      await db.walletProjection.findUniqueOrThrow({ where: { userId: user.id } })
    ).toMatchObject({
      pendingVnd: 0n,
      availableVnd: 5_000n
    });

    await ingestConversion({
      source: ConnectorType.ACCESSTRADE_API,
      authority: EvidenceAuthority.AUTHORITATIVE,
      platform: Platform.ACCESSTRADE,
      affiliateAccount: account,
      conversion: {
        externalOrderId,
        externalItemKey,
        clickToken: click.clickToken,
        purchasedAt: new Date(),
        grossCommissionVnd: 10_000n,
        netCommissionVnd: 10_000n,
        status: "rejected",
        items: [],
        payload: { fixture: "correction" }
      }
    });
    const [corrected, wallet, reversedBatch, reversedLine] = await Promise.all([
      db.conversion.findUniqueOrThrow({ where: { id: created.conversionId } }),
      db.walletProjection.findUniqueOrThrow({ where: { userId: user.id } }),
      db.settlementBatch.findUniqueOrThrow({ where: { id: first.id } }),
      db.settlementLine.findUniqueOrThrow({
        where: { conversionId: created.conversionId }
      })
    ]);
    expect(corrected.settlementStatus).toBe("REVERSED");
    expect(wallet.availableVnd).toBe(0n);
    expect(reversedBatch.status).toBe("REVERSED");
    expect(reversedLine.status).toBe("REVERSED");
  });
});

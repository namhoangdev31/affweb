import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConnectorType,
  EvidenceAuthority,
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  Platform,
  UserStatus
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { NormalizedConversion } from "@/modules/connectors/types";
import { ingestConversion } from "@/modules/conversions/service";
import { postJournal } from "@/modules/ledger/service";
import { createPayoutTicket } from "@/modules/payout/service";

describe("conversion ingestion and ledger", () => {
  beforeAll(async () => {
    await db.featureFlag.upsert({
      where: { key: "payout.daily_budget_vnd" },
      create: {
        key: "payout.daily_budget_vnd",
        enabled: true,
        value: { amountVnd: "1000000000000" }
      },
      update: {
        enabled: true,
        value: { amountVnd: "1000000000000" }
      }
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("deduplicates AddLiveTag and official Shopee, then reverses a rejection", async () => {
    const suffix = randomUUID();
    const user = await db.user.create({
      data: {
        email: `conversion-${suffix}@example.test`,
        status: UserStatus.ACTIVE
      }
    });
    const merchant = await db.merchant.create({
      data: {
        platform: Platform.SHOPEE_MARKETPLACE,
        code: `test-${suffix}`,
        slug: `test-${suffix}`,
        name: "Shopee integration test",
        defaultShareBps: 5000
      }
    });
    const addLiveTag = await db.affiliateAccount.create({
      data: {
        connectorType: ConnectorType.ADDLIVETAG_ACCOUNT,
        platform: Platform.SHOPEE_MARKETPLACE,
        externalAccountId: `alt-${suffix}`,
        label: "ALT test"
      }
    });
    const official = await db.affiliateAccount.create({
      data: {
        connectorType: ConnectorType.SHOPEE_OPEN_API,
        platform: Platform.SHOPEE_MARKETPLACE,
        externalAccountId: `official-${suffix}`,
        label: "Official test"
      }
    });
    const click = await db.affiliateClick.create({
      data: {
        clickToken: `click-${suffix}`,
        userId: user.id,
        merchantId: merchant.id,
        affiliateAccountId: addLiveTag.id,
        platform: Platform.SHOPEE_MARKETPLACE,
        targetType: "PRODUCT",
        originUrl: "https://shopee.vn/product/1/2",
        subIds: [`click-${suffix}`],
        clickedAt: new Date(),
        attribution: {
          create: {
            merchantId: merchant.id,
            shareBps: 5000,
            snapshot: { source: "integration-test" }
          }
        }
      }
    });
    const baseConversion: Omit<NormalizedConversion, "status"> = {
      externalOrderId: `order-${suffix}`,
      externalItemKey: "line-1",
      clickToken: click.clickToken,
      purchasedAt: new Date(),
      grossCommissionVnd: 10_000n,
      netCommissionVnd: 10_000n,
      items: [],
      payload: { fixture: true }
    };

    const first = await ingestConversion({
      source: ConnectorType.ADDLIVETAG_ACCOUNT,
      authority: EvidenceAuthority.PROVISIONAL_AUTHORITATIVE,
      platform: Platform.SHOPEE_MARKETPLACE,
      affiliateAccount: addLiveTag,
      conversion: { ...baseConversion, status: "pending" }
    });
    const upgraded = await ingestConversion({
      source: ConnectorType.SHOPEE_OPEN_API,
      authority: EvidenceAuthority.AUTHORITATIVE,
      platform: Platform.SHOPEE_MARKETPLACE,
      affiliateAccount: official,
      conversion: { ...baseConversion, status: "validated" }
    });

    expect(upgraded.conversionId).toBe(first.conversionId);
    expect(
      await db.externalConversionIdentity.count({
        where: { conversionId: first.conversionId }
      })
    ).toBe(2);
    expect(
      await db.ledgerTransaction.count({
        where: { reference: first.conversionId }
      })
    ).toBe(1);

    await ingestConversion({
      source: ConnectorType.SHOPEE_OPEN_API,
      authority: EvidenceAuthority.AUTHORITATIVE,
      platform: Platform.SHOPEE_MARKETPLACE,
      affiliateAccount: official,
      conversion: { ...baseConversion, status: "rejected" }
    });

    const [conversion, wallet, journalCount] = await Promise.all([
      db.conversion.findUniqueOrThrow({ where: { id: first.conversionId } }),
      db.walletProjection.findUniqueOrThrow({ where: { userId: user.id } }),
      db.ledgerTransaction.count({ where: { reference: first.conversionId } })
    ]);
    expect(conversion.status).toBe("REJECTED");
    expect(conversion.cashbackVnd).toBe(0n);
    expect(wallet.pendingVnd).toBe(0n);
    expect(wallet.availableVnd).toBe(0n);
    expect(journalCount).toBe(2);

    const entry = await db.ledgerEntry.findFirstOrThrow({
      where: { transaction: { reference: first.conversionId } }
    });
    await expect(
      db.ledgerEntry.update({
        where: { id: entry.id },
        data: { amountVnd: { increment: 1n } }
      })
    ).rejects.toThrow(/append-only/);

    const unbalancedKey = `unbalanced-${suffix}`;
    await expect(
      postJournal(db, {
        type: LedgerTransactionType.MANUAL_ADJUSTMENT,
        idempotencyKey: unbalancedKey,
        description: "Constraint fixture",
        lines: [
          {
            accountCode: "asset:bank:test",
            accountName: "Bank test",
            accountKind: LedgerAccountKind.ASSET,
            direction: LedgerDirection.DEBIT,
            amountVnd: 150_000n
          },
          {
            accountCode: "liability:user:test",
            accountName: "User test",
            accountKind: LedgerAccountKind.LIABILITY,
            direction: LedgerDirection.CREDIT,
            amountVnd: 78_000n
          }
        ]
      })
    ).rejects.toThrow(/not balanced/);
    expect(await db.ledgerTransaction.count({ where: { idempotencyKey: unbalancedKey } })).toBe(0);
  });

  it("does not reserve more than the wallet under concurrent payout requests", async () => {
    const suffix = randomUUID();
    const user = await db.user.create({
      data: {
        email: `payout-race-${suffix}@example.test`,
        status: UserStatus.ACTIVE,
        wallet: { create: { availableVnd: 500_000n } }
      }
    });
    const beneficiary = await db.bankBeneficiary.create({
      data: {
        userId: user.id,
        bankBin: "970422",
        accountNumberCipher: "integration-test-not-decrypted",
        accountNameCipher: "integration-test-not-decrypted",
        accountLast4: "1234",
        encryptionKeyVersion: 1,
        status: "VERIFIED",
        verifiedAt: new Date(),
        changes: {
          create: {
            userId: user.id,
            newLast4: "1234",
            holdUntil: new Date(Date.now() - 1_000)
          }
        }
      }
    });

    const results = await Promise.allSettled([
      createPayoutTicket({
        userId: user.id,
        beneficiaryId: beneficiary.id,
        amountVnd: 300_000n,
        idempotencyKey: "integration-payout-concurrency-a",
        requestHash: "hash-a"
      }),
      createPayoutTicket({
        userId: user.id,
        beneficiaryId: beneficiary.id,
        amountVnd: 300_000n,
        idempotencyKey: "integration-payout-concurrency-b",
        requestHash: "hash-b"
      })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const [wallet, tickets] = await Promise.all([
      db.walletProjection.findUniqueOrThrow({ where: { userId: user.id } }),
      db.payoutTicket.findMany({ where: { userId: user.id } })
    ]);
    expect(wallet.availableVnd).toBe(200_000n);
    expect(wallet.reservedVnd).toBe(300_000n);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.status).toBe("RESERVED");
  });

  it("returns one payout ticket for concurrent requests with the same idempotency key", async () => {
    const suffix = randomUUID();
    const user = await db.user.create({
      data: {
        email: `payout-idempotency-${suffix}@example.test`,
        status: UserStatus.ACTIVE,
        wallet: { create: { availableVnd: 500_000n } }
      }
    });
    const beneficiary = await db.bankBeneficiary.create({
      data: {
        userId: user.id,
        bankBin: "970422",
        accountNumberCipher: "integration-test-not-decrypted",
        accountNameCipher: "integration-test-not-decrypted",
        accountLast4: "1234",
        encryptionKeyVersion: 1,
        status: "VERIFIED",
        verifiedAt: new Date(),
        changes: {
          create: {
            userId: user.id,
            newLast4: "1234",
            holdUntil: new Date(Date.now() - 1_000)
          }
        }
      }
    });
    const request = {
      userId: user.id,
      beneficiaryId: beneficiary.id,
      amountVnd: 300_000n,
      idempotencyKey: `integration-payout-same-${suffix}`,
      requestHash: "same-request-hash"
    };

    const [first, second] = await Promise.all([
      createPayoutTicket(request),
      createPayoutTicket(request)
    ]);

    expect(second.id).toBe(first.id);
    expect(await db.payoutTicket.count({ where: { userId: user.id } })).toBe(1);
    await expect(
      db.walletProjection.findUniqueOrThrow({ where: { userId: user.id } })
    ).resolves.toMatchObject({
      availableVnd: 200_000n,
      reservedVnd: 300_000n
    });
  });
});

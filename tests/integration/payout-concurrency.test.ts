import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

describe("tenant payout PostgreSQL concurrency", () => {
  const suffix = randomUUID();
  let tenantId = "";
  let userId = "";
  let beneficiaryId = "";

  beforeAll(async () => {
    const user = await db.user.create({
      data: { email: `tenant-finance-${suffix}@example.test`, status: UserStatus.ACTIVE }
    });
    userId = user.id;
    const tenant = await db.tenant.create({
      data: {
        slug: `finance-${suffix}`,
        name: "Finance concurrency tenant",
        status: "ACTIVE",
        isTrial: false,
        planExpiresAt: new Date(Date.now() + 86_400_000)
      }
    });
    tenantId = tenant.id;
    await db.user.update({ where: { id: userId }, data: { tenantId } });
    const beneficiary = await db.bankBeneficiary.create({
      data: {
        userId,
        bankBin: "970422",
        accountNumberCipher: "integration-cipher",
        accountNameCipher: "integration-cipher",
        accountLast4: "1234",
        encryptionKeyVersion: 1,
        status: "VERIFIED",
        verifiedAt: new Date()
      }
    });
    beneficiaryId = beneficiary.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function createPayout(reference: string) {
    return db.tenantPayout.create({
      data: {
        reference,
        tenantId,
        userId,
        requestedByUserId: userId,
        beneficiaryId,
        amountVnd: 50_000n,
        clientIdempotencyKey: reference,
        requestHash: reference,
        bankBinSnapshot: "970422",
        accountLast4Snapshot: "1234",
        accountNumberCipherSnapshot: "integration-cipher",
        accountNameCipherSnapshot: "integration-cipher"
      }
    });
  }

  it("allows only one execution intent for a payout under concurrent writers", async () => {
    const payout = await createPayout(`intent-${suffix}`);
    const results = await Promise.allSettled([
      db.tenantPayoutExecutionIntent.create({
        data: {
          tenantPayoutId: payout.id,
          providerReference: `provider-a-${suffix}`,
          providerIdempotencyKey: `intent-a-${suffix}`,
          requestFingerprint: "fingerprint"
        }
      }),
      db.tenantPayoutExecutionIntent.create({
        data: {
          tenantPayoutId: payout.id,
          providerReference: `provider-b-${suffix}`,
          providerIdempotencyKey: `intent-b-${suffix}`,
          requestFingerprint: "fingerprint"
        }
      })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.tenantPayoutExecutionIntent.count({ where: { tenantPayoutId: payout.id } })
    ).toBe(1);
  });

  it("allows only one SUBMIT evidence row for an execution intent", async () => {
    const payout = await createPayout(`submit-${suffix}`);
    const intent = await db.tenantPayoutExecutionIntent.create({
      data: {
        tenantPayoutId: payout.id,
        providerReference: `provider-submit-${suffix}`,
        providerIdempotencyKey: `intent-submit-${suffix}`,
        requestFingerprint: "fingerprint"
      }
    });
    const results = await Promise.allSettled([
      db.tenantPayoutAttempt.create({
        data: {
          tenantPayoutId: payout.id,
          intentId: intent.id,
          operation: "SUBMIT",
          sequence: 1,
          attemptNumber: 1,
          idempotencyKey: `submit-a-${suffix}`
        }
      }),
      db.tenantPayoutAttempt.create({
        data: {
          tenantPayoutId: payout.id,
          intentId: intent.id,
          operation: "SUBMIT",
          sequence: 2,
          attemptNumber: 2,
          idempotencyKey: `submit-b-${suffix}`
        }
      })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.tenantPayoutAttempt.count({ where: { intentId: intent.id, operation: "SUBMIT" } })
    ).toBe(1);
  });

  it("serializes competing reservations and never makes available balance negative", async () => {
    await db.tenantMemberWalletProjection.create({
      data: { tenantId, userId, availableVnd: 100_000n }
    });
    const reserve = () =>
      db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "TenantMemberWalletProjection" WHERE "tenantId" = ${tenantId} AND "userId" = ${userId} FOR UPDATE`;
          const wallet = await tx.tenantMemberWalletProjection.findUniqueOrThrow({
            where: { tenantId_userId: { tenantId, userId } }
          });
          if (wallet.availableVnd < 80_000n) throw new Error("INSUFFICIENT_BALANCE");
          return tx.tenantMemberWalletProjection.update({
            where: { tenantId_userId: { tenantId, userId } },
            data: { availableVnd: { decrement: 80_000n }, reservedVnd: { increment: 80_000n } }
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    const results = await Promise.allSettled([reserve(), reserve()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const wallet = await db.tenantMemberWalletProjection.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId, userId } }
    });
    expect(wallet.availableVnd).toBe(20_000n);
    expect(wallet.reservedVnd).toBe(80_000n);
  });
});

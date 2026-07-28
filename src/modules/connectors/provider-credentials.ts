import "server-only";

import { z } from "zod";
import { ConnectorType, Prisma, ProviderCredentialStatus } from "@/generated/prisma/client";
import { decryptProviderCredential, encryptProviderCredential, stableHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

const accessTradeCredentialSchema = z.object({
  provider: z.literal(ConnectorType.ACCESSTRADE_API),
  apiKey: z.string().trim().min(16).max(512),
  publisherId: z.string().trim().min(1).max(200)
});

const lazadaCredentialSchema = z.object({
  provider: z.literal(ConnectorType.LAZADA_OPEN_API),
  appKey: z.string().trim().min(1).max(200),
  appSecret: z.string().trim().min(8).max(512),
  userToken: z.string().trim().min(8).max(2_000),
  affiliateId: z.string().trim().min(1).max(200)
});

export const providerCredentialPayloadSchema = z.discriminatedUnion("provider", [
  accessTradeCredentialSchema,
  lazadaCredentialSchema
]);

export type ProviderCredentialPayload = z.infer<typeof providerCredentialPayloadSchema>;

function credentialFingerprint(payload: ProviderCredentialPayload): string {
  const accountIdentity =
    payload.provider === ConnectorType.ACCESSTRADE_API
      ? payload.publisherId
      : `${payload.affiliateId}:${payload.appKey}`;
  return stableHash(`${payload.provider}:${accountIdentity}`).slice(0, 24);
}

export async function activeProviderCredential(
  affiliateAccountId: string
): Promise<ProviderCredentialPayload | null> {
  const credential = await db.providerCredential.findFirst({
    where: {
      affiliateAccountId,
      status: ProviderCredentialStatus.ACTIVE,
      revokedAt: null
    },
    orderBy: { version: "desc" }
  });
  if (!credential) return null;
  try {
    return providerCredentialPayloadSchema.parse(
      JSON.parse(decryptProviderCredential(credential.encryptedPayload))
    );
  } catch {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Provider credential cannot be decrypted.", 503);
  }
}

export async function saveVerifiedProviderCredential(input: {
  affiliateAccountId: string;
  actorUserId: string;
  payload: ProviderCredentialPayload;
}): Promise<{ fingerprint: string; version: number; verifiedAt: Date }> {
  const payload = providerCredentialPayloadSchema.parse(input.payload);
  const fingerprint = credentialFingerprint(payload);
  const verifiedAt = new Date();
  const encryptedPayload = encryptProviderCredential(JSON.stringify(payload));

  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "AffiliateAccount"
        WHERE id = ${input.affiliateAccountId}
        FOR UPDATE
      `;
      const account = await tx.affiliateAccount.findUniqueOrThrow({
        where: { id: input.affiliateAccountId }
      });
      if (account.connectorType !== payload.provider) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Credential provider does not match the provider account.",
          400
        );
      }
      const credentialAccountId =
        payload.provider === ConnectorType.ACCESSTRADE_API
          ? payload.publisherId
          : payload.affiliateId;
      if (credentialAccountId !== account.externalAccountId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Credential account identity does not match provider account.",
          400
        );
      }
      const latest = await tx.providerCredential.findFirst({
        where: { affiliateAccountId: account.id },
        orderBy: { version: "desc" },
        select: { version: true }
      });
      const version = (latest?.version ?? 0) + 1;
      await tx.providerCredential.updateMany({
        where: {
          affiliateAccountId: account.id,
          status: ProviderCredentialStatus.ACTIVE
        },
        data: {
          status: ProviderCredentialStatus.REVOKED,
          revokedAt: verifiedAt
        }
      });
      await tx.providerCredential.create({
        data: {
          affiliateAccountId: account.id,
          encryptedPayload,
          fingerprint,
          version,
          status: ProviderCredentialStatus.ACTIVE,
          createdByUserId: input.actorUserId,
          verifiedAt
        }
      });
      await tx.affiliateAccount.update({
        where: { id: account.id },
        data: { fingerprint, verifiedAt }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: "provider_credential.rotated",
          entityType: "AffiliateAccount",
          entityId: account.id,
          after: {
            provider: payload.provider,
            fingerprint,
            version,
            status: ProviderCredentialStatus.ACTIVE
          }
        }
      });
      return { fingerprint, version, verifiedAt };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

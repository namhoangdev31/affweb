import "server-only";

import { createHash } from "node:crypto";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import { IdentityState, Role, UserStatus } from "@/generated/prisma/client";
import { reconcileClerkUser } from "@/lib/clerk-identity";
import type { ClerkUserLike } from "@/lib/clerk-identity-mapping";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

type UserEventData = Extract<WebhookEvent, { type: "user.created" | "user.updated" }>["data"];

function normalizedWebhookUser(data: UserEventData): ClerkUserLike {
  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    imageUrl: data.image_url,
    updatedAt: data.updated_at,
    primaryEmailAddressId: data.primary_email_address_id,
    emailAddresses: data.email_addresses.map((email) => ({
      id: email.id,
      emailAddress: email.email_address,
      verification: email.verification ? { status: email.verification.status } : null
    })),
    externalAccounts: data.external_accounts.map((account) => ({
      provider: account.provider,
      verification: account.verification ? { status: account.verification.status } : null
    })),
    banned: data.banned,
    locked: data.locked
  };
}

async function anonymizeDeletedUser(clerkUserId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { clerkUserId },
      select: { id: true, status: true, email: true }
    });
    if (!user) return;

    const now = new Date();
    const redactedEmail = `${user.id}@redacted.invalid`;
    await Promise.all([
      tx.roleAssignment.deleteMany({
        where: { userId: user.id, role: { not: Role.USER } }
      }),
      tx.adminPasskey.deleteMany({ where: { userId: user.id } }),
      tx.recoveryCode.deleteMany({ where: { userId: user.id } }),
      tx.pushSubscription.deleteMany({ where: { userId: user.id } }),
      tx.session.deleteMany({ where: { userId: user.id } })
    ]);
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: null,
        email: redactedEmail,
        emailVerified: null,
        image: null,
        inviteCode: null,
        status: UserStatus.CLOSED,
        identityState: IdentityState.DELETED,
        identityDeletedAt: now,
        identityUpdatedAt: now,
        anonymizedAt: now
      }
    });
    await tx.accountDeletionRequest.updateMany({
      where: {
        userId: user.id,
        status: { in: ["APPROVED", "EXECUTING"] }
      },
      data: {
        status: "COMPLETED",
        completedAt: now,
        failureMessage: null
      }
    });
    await tx.auditLog.create({
      data: {
        action: "identity.anonymized",
        entityType: "User",
        entityId: user.id,
        before: { status: user.status, hadEmail: Boolean(user.email) },
        after: { status: UserStatus.CLOSED, identityState: IdentityState.DELETED }
      }
    });
  });
}

export async function handleClerkWebhook(event: WebhookEvent): Promise<void> {
  if (event.type === "user.created" || event.type === "user.updated") {
    try {
      await reconcileClerkUser(normalizedWebhookUser(event.data));
    } catch (error) {
      await db.$transaction(async (tx) => {
        const local = await tx.user.findUnique({
          where: { clerkUserId: event.data.id },
          select: { id: true }
        });
        if (local) {
          await tx.user.update({
            where: { id: local.id },
            data: { identityState: IdentityState.SYNC_ERROR }
          });
          await tx.auditLog.create({
            data: {
              action: "identity.sync_failed",
              entityType: "User",
              entityId: local.id,
              metadata: {
                eventType: event.type,
                error: error instanceof Error ? error.message.slice(0, 500) : "unknown"
              }
            }
          });
        }
      });
      throw error;
    }
    return;
  }
  if (event.type === "user.deleted" && event.data.id) {
    await anonymizeDeletedUser(event.data.id);
  }
}

export async function claimWebhookEvent(svixId: string, event: WebhookEvent): Promise<boolean> {
  const requestHash = createHash("sha256")
    .update(`${event.type}:${event.data.id ?? "unknown"}`)
    .digest("hex");
  try {
    await db.idempotencyRecord.create({
      data: {
        namespace: "clerk-webhook",
        idempotencyKey: svixId,
        requestHash,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
    return true;
  } catch {
    const duplicate = await db.idempotencyRecord.findUnique({
      where: {
        namespace_idempotencyKey: {
          namespace: "clerk-webhook",
          idempotencyKey: svixId
        }
      },
      select: { requestHash: true }
    });
    if (duplicate?.requestHash === requestHash) return false;
    throw new AppError("CONFLICT", "Webhook idempotency key conflict.", 409);
  }
}

export async function completeWebhookEvent(svixId: string): Promise<void> {
  await db.idempotencyRecord.update({
    where: {
      namespace_idempotencyKey: {
        namespace: "clerk-webhook",
        idempotencyKey: svixId
      }
    },
    data: {
      responseStatus: 200,
      responseBody: { accepted: true }
    }
  });
}

export async function releaseWebhookClaim(svixId: string): Promise<void> {
  await db.idempotencyRecord.deleteMany({
    where: {
      namespace: "clerk-webhook",
      idempotencyKey: svixId,
      responseStatus: null
    }
  });
}

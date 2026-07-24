-- Expand-only Clerk identity migration.
-- Auth.js tables stay in place for the seven-day rollback window.

CREATE TYPE "IdentityState" AS ENUM ('UNLINKED', 'ACTIVE', 'BANNED', 'DELETED', 'SYNC_ERROR');
CREATE TYPE "IdentityInvitationStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'REVOKED', 'EXPIRED', 'FAILED');
CREATE TYPE "AccountDeletionStatus" AS ENUM ('REQUESTED', 'BLOCKED', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED');

ALTER TABLE "User"
  ADD COLUMN "clerkUserId" TEXT,
  ADD COLUMN "identityState" "IdentityState" NOT NULL DEFAULT 'UNLINKED',
  ADD COLUMN "identityUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "identityDeletedAt" TIMESTAMP(3),
  ADD COLUMN "anonymizedAt" TIMESTAMP(3);

CREATE TABLE "IdentityInvitation" (
  "id" TEXT NOT NULL,
  "clerkInvitationId" TEXT,
  "email" TEXT NOT NULL,
  "status" "IdentityInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "userId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdentityInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "AccountDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT,
  "blockedReason" TEXT,
  "failureMessage" TEXT,
  "approvedByUserId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");
CREATE UNIQUE INDEX "IdentityInvitation_clerkInvitationId_key" ON "IdentityInvitation"("clerkInvitationId");
CREATE INDEX "IdentityInvitation_email_status_idx" ON "IdentityInvitation"("email", "status");
CREATE INDEX "IdentityInvitation_createdByUserId_createdAt_idx" ON "IdentityInvitation"("createdByUserId", "createdAt");
CREATE INDEX "AccountDeletionRequest_userId_status_idx" ON "AccountDeletionRequest"("userId", "status");
CREATE INDEX "AccountDeletionRequest_status_requestedAt_idx" ON "AccountDeletionRequest"("status", "requestedAt");

ALTER TABLE "IdentityInvitation"
  ADD CONSTRAINT "IdentityInvitation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IdentityInvitation"
  ADD CONSTRAINT "IdentityInvitation_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountDeletionRequest"
  ADD CONSTRAINT "AccountDeletionRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountDeletionRequest"
  ADD CONSTRAINT "AccountDeletionRequest_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

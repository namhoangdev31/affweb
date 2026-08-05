-- Additive hierarchical-finance migration. Legacy payout rows are never submitted by this migration.

ALTER TYPE "TenantObligationStatus" ADD VALUE IF NOT EXISTS 'LOCKED' AFTER 'PENDING_FUNDING';
ALTER TYPE "TenantFundingOrderStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN';

CREATE TYPE "TenantPayoutType" AS ENUM ('MEMBER_WITHDRAWAL', 'TENANT_TREASURY_WITHDRAWAL');
CREATE TYPE "PayoutApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "PayoutSettlementStatus" AS ENUM ('NOT_STARTED', 'PROCESSING', 'PAID', 'FAILED', 'UNKNOWN');
CREATE TYPE "PayoutMethod" AS ENUM ('PAYOS', 'MANUAL_BANK_TRANSFER');
CREATE TYPE "TenantPayoutIntentDispatchStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PUBLISHED', 'FAILED', 'EXHAUSTED');
CREATE TYPE "TenantPayoutIntentExecutionStatus" AS ENUM ('READY', 'CLAIMED', 'REQUESTED', 'CONFIRMED', 'FAILED', 'UNKNOWN');
CREATE TYPE "TenantPayoutAttemptOperation" AS ENUM ('SUBMIT', 'RECONCILE');
CREATE TYPE "TenantPayoutAttemptStatus" AS ENUM ('CREATED', 'REQUESTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN');
CREATE TYPE "ManualPayoutResolution" AS ENUM ('CONFIRMED_PAID', 'CONFIRMED_NOT_SENT', 'REMAIN_UNKNOWN');
CREATE TYPE "LegacyPayoutResolutionStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'RESOLVED', 'MANUAL_REVIEW');

ALTER TABLE "Tenant" ADD COLUMN "payoutRequestEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "payoutApprovalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "treasuryWithdrawalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "manualPayoutEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "autoReconciliationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "zaloWalletEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "zaloPayoutEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TenantFundingOrder" ADD COLUMN "reconciliationSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastReconciledAt" TIMESTAMP(3),
ADD COLUMN "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reviewReason" TEXT;

ALTER TABLE "AuditLog" ADD COLUMN "actorRole" TEXT,
ADD COLUMN "targetTenantId" TEXT,
ADD COLUMN "targetUserId" TEXT,
ADD COLUMN "source" TEXT,
ADD COLUMN "userAgent" TEXT,
ADD COLUMN "reason" TEXT;

ALTER TABLE "TenantPayout" ADD COLUMN "approvalNote" TEXT,
ADD COLUMN "approvalStatus" "PayoutApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedByUserId" TEXT,
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledByUserId" TEXT,
ADD COLUMN "isPlatformSelfApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "legacyImportedAt" TIMESTAMP(3),
ADD COLUMN "legacyResolutionStatus" "LegacyPayoutResolutionStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "legacySourceId" TEXT,
ADD COLUMN "legacySourceStatus" TEXT,
ADD COLUMN "legacySourceType" TEXT,
ADD COLUMN "manualCompletedAt" TIMESTAMP(3),
ADD COLUMN "manualCompletedByUserId" TEXT,
ADD COLUMN "manualEvidenceReference" TEXT,
ADD COLUMN "manualResolutionType" "ManualPayoutResolution",
ADD COLUMN "manualResolvedAt" TIMESTAMP(3),
ADD COLUMN "manualResolvedByUserId" TEXT,
ADD COLUMN "manualStartedAt" TIMESTAMP(3),
ADD COLUMN "manualStartedByUserId" TEXT,
ADD COLUMN "manualTransferReference" TEXT,
ADD COLUMN "method" "PayoutMethod",
ADD COLUMN "platformSelfApprovalReason" TEXT,
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "rejectedByUserId" TEXT,
ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "requestedByUserId" TEXT,
ADD COLUMN "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reservationJournalId" TEXT,
ADD COLUMN "reviewReason" TEXT,
ADD COLUMN "riskScore" INTEGER,
ADD COLUMN "settlementStatus" "PayoutSettlementStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "terminalJournalId" TEXT,
ADD COLUMN "type" "TenantPayoutType" NOT NULL DEFAULT 'MEMBER_WITHDRAWAL';

-- Preserve evidence without assuming legacy approval. Ambiguous rows use the Owner-only resolver.
UPDATE "TenantPayout"
SET "requestedByUserId" = "userId",
    "legacySourceType" = 'TENANT_PAYOUT',
    "legacySourceId" = "id",
    "legacySourceStatus" = "status"::text,
    "legacyImportedAt" = CURRENT_TIMESTAMP,
    "legacyResolutionStatus" = CASE
      WHEN "status" IN ('RESERVED', 'CANCELLED') THEN 'PENDING'::"LegacyPayoutResolutionStatus"
      WHEN "status" = 'PAID' AND "paidAt" IS NOT NULL THEN 'RESOLVED'::"LegacyPayoutResolutionStatus"
      ELSE 'MANUAL_REVIEW'::"LegacyPayoutResolutionStatus"
    END,
    "approvalStatus" = CASE
      WHEN "status" = 'CANCELLED' THEN 'CANCELLED'::"PayoutApprovalStatus"
      WHEN "status" = 'PAID' AND "paidAt" IS NOT NULL THEN 'APPROVED'::"PayoutApprovalStatus"
      ELSE 'PENDING'::"PayoutApprovalStatus"
    END,
    "settlementStatus" = CASE
      WHEN "status" = 'PAID' AND "paidAt" IS NOT NULL THEN 'PAID'::"PayoutSettlementStatus"
      WHEN "status" IN ('SUBMITTED', 'PROCESSING', 'UNKNOWN', 'FAILED') THEN 'UNKNOWN'::"PayoutSettlementStatus"
      ELSE 'NOT_STARTED'::"PayoutSettlementStatus"
    END,
    "requiresManualReview" = "status" IN ('SUBMITTED', 'PROCESSING', 'UNKNOWN', 'FAILED') OR ("status" = 'PAID' AND "paidAt" IS NULL),
    "reviewReason" = CASE
      WHEN "status" IN ('SUBMITTED', 'PROCESSING', 'UNKNOWN', 'FAILED') THEN 'LEGACY_EVIDENCE_REQUIRED'
      WHEN "status" = 'PAID' AND "paidAt" IS NULL THEN 'LEGACY_PAID_WITHOUT_TIMESTAMP'
      ELSE NULL
    END;

ALTER TABLE "TenantPayoutAttempt" ADD COLUMN "actorUserId" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "errorClassification" TEXT,
ADD COLUMN "intentId" TEXT,
ADD COLUMN "operation" "TenantPayoutAttemptOperation" NOT NULL DEFAULT 'SUBMIT',
ADD COLUMN "providerResponseCode" TEXT,
ADD COLUMN "providerResponseStatus" TEXT,
ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "status" "TenantPayoutAttemptStatus" NOT NULL DEFAULT 'CREATED',
ADD COLUMN "workerIdentity" TEXT,
ALTER COLUMN "attemptNumber" SET DEFAULT 1;

CREATE TABLE "TenantPayoutExecutionIntent" (
  "id" TEXT NOT NULL,
  "tenantPayoutId" TEXT NOT NULL,
  "providerReference" TEXT NOT NULL,
  "providerIdempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "dispatchStatus" "TenantPayoutIntentDispatchStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "executionStatus" "TenantPayoutIntentExecutionStatus" NOT NULL DEFAULT 'READY',
  "lastDispatchError" TEXT,
  "claimedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantPayoutExecutionIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QStashUsageDaily" (
  "id" TEXT NOT NULL,
  "usageDate" DATE NOT NULL,
  "purpose" TEXT NOT NULL,
  "publishedCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QStashUsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceSafetySweepState" (
  "id" TEXT NOT NULL DEFAULT 'finance',
  "cursorCreatedAt" TIMESTAMP(3),
  "cursorId" TEXT,
  "lastRunAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceSafetySweepState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZaloUserBinding" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "zaloUserIdHash" TEXT NOT NULL,
  "zaloUserIdCipher" BYTEA NOT NULL,
  "activeIdentityKey" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unboundAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ZaloUserBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZaloUserBindingToken" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZaloUserBindingToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZaloFinancialGrant" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZaloFinancialGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPayoutExecutionIntent_tenantPayoutId_key" ON "TenantPayoutExecutionIntent"("tenantPayoutId");
CREATE UNIQUE INDEX "TenantPayoutExecutionIntent_providerReference_key" ON "TenantPayoutExecutionIntent"("providerReference");
CREATE UNIQUE INDEX "TenantPayoutExecutionIntent_providerIdempotencyKey_key" ON "TenantPayoutExecutionIntent"("providerIdempotencyKey");
CREATE UNIQUE INDEX "TenantPayout_legacySourceType_legacySourceId_key" ON "TenantPayout"("legacySourceType", "legacySourceId");
CREATE INDEX "TenantPayout_tenantId_approvalStatus_settlementStatus_createdAt_idx" ON "TenantPayout"("tenantId", "approvalStatus", "settlementStatus", "createdAt");
CREATE UNIQUE INDEX "TenantPayoutAttempt_intentId_operation_sequence_key" ON "TenantPayoutAttempt"("intentId", "operation", "sequence");
CREATE UNIQUE INDEX "TenantPayoutAttempt_one_submit_per_intent" ON "TenantPayoutAttempt"("intentId") WHERE "intentId" IS NOT NULL AND "operation" = 'SUBMIT';
CREATE UNIQUE INDEX "QStashUsageDaily_usageDate_purpose_key" ON "QStashUsageDaily"("usageDate", "purpose");
CREATE INDEX "QStashUsageDaily_usageDate_idx" ON "QStashUsageDaily"("usageDate");
CREATE UNIQUE INDEX "ZaloUserBinding_activeIdentityKey_key" ON "ZaloUserBinding"("activeIdentityKey");
CREATE INDEX "ZaloUserBinding_tenantId_userId_expiresAt_idx" ON "ZaloUserBinding"("tenantId", "userId", "expiresAt");
CREATE INDEX "ZaloUserBinding_zaloUserIdHash_boundAt_idx" ON "ZaloUserBinding"("zaloUserIdHash", "boundAt");
CREATE UNIQUE INDEX "ZaloUserBindingToken_tokenHash_key" ON "ZaloUserBindingToken"("tokenHash");
CREATE INDEX "ZaloUserBindingToken_tenantId_userId_expiresAt_idx" ON "ZaloUserBindingToken"("tenantId", "userId", "expiresAt");
CREATE UNIQUE INDEX "ZaloFinancialGrant_tokenHash_key" ON "ZaloFinancialGrant"("tokenHash");
CREATE INDEX "ZaloFinancialGrant_tenantId_userId_expiresAt_idx" ON "ZaloFinancialGrant"("tenantId", "userId", "expiresAt");
CREATE INDEX "AuditLog_targetTenantId_createdAt_idx" ON "AuditLog"("targetTenantId", "createdAt");

ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_manualStartedByUserId_fkey" FOREIGN KEY ("manualStartedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_manualCompletedByUserId_fkey" FOREIGN KEY ("manualCompletedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_manualResolvedByUserId_fkey" FOREIGN KEY ("manualResolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayoutExecutionIntent" ADD CONSTRAINT "TenantPayoutExecutionIntent_tenantPayoutId_fkey" FOREIGN KEY ("tenantPayoutId") REFERENCES "TenantPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayoutAttempt" ADD CONSTRAINT "TenantPayoutAttempt_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "TenantPayoutExecutionIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZaloUserBinding" ADD CONSTRAINT "ZaloUserBinding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZaloUserBinding" ADD CONSTRAINT "ZaloUserBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZaloUserBindingToken" ADD CONSTRAINT "ZaloUserBindingToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZaloUserBindingToken" ADD CONSTRAINT "ZaloUserBindingToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZaloFinancialGrant" ADD CONSTRAINT "ZaloFinancialGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZaloFinancialGrant" ADD CONSTRAINT "ZaloFinancialGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TenantPayout_amount_positive'
      AND conrelid = '"TenantPayout"'::regclass
  ) THEN
    ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_amount_positive" CHECK ("amountVnd" > 0);
  END IF;
END $$;
ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_terminal_status_consistent" CHECK (
  ("settlementStatus" = 'PAID' AND "paidAt" IS NOT NULL)
  OR "settlementStatus" <> 'PAID'
);

CREATE OR REPLACE FUNCTION prevent_tenant_payout_intent_identity_update()
RETURNS trigger AS $$
BEGIN
  IF NEW."tenantPayoutId" <> OLD."tenantPayoutId"
     OR NEW."providerReference" <> OLD."providerReference"
     OR NEW."providerIdempotencyKey" <> OLD."providerIdempotencyKey"
     OR NEW."requestFingerprint" <> OLD."requestFingerprint" THEN
    RAISE EXCEPTION 'Tenant payout execution intent identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TenantPayoutExecutionIntent_immutable_identity"
BEFORE UPDATE ON "TenantPayoutExecutionIntent"
FOR EACH ROW EXECUTE FUNCTION prevent_tenant_payout_intent_identity_update();

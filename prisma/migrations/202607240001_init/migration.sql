-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'SUPPORT', 'FINANCE_REVIEWER', 'FINANCE_APPROVER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('SHOPEE_MARKETPLACE', 'SHOPEE_FOOD', 'LAZADA', 'ACCESSTRADE');

-- CreateEnum
CREATE TYPE "AffiliateTargetType" AS ENUM ('PRODUCT', 'SHOP', 'CAMPAIGN', 'HOME', 'RESTAURANT', 'ITEM', 'OFFER');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('SHOPEE_DIRECT', 'SHOPEE_OPEN_API', 'ADDLIVETAG_ACCOUNT', 'ADDLIVETAG_CATALOG', 'ACCESSTRADE_API', 'LAZADA_OPEN_API');

-- CreateEnum
CREATE TYPE "ConnectorMode" AS ENUM ('DISABLED', 'CREDENTIAL_READY', 'SHADOW', 'ACTIVE', 'DEGRADED');

-- CreateEnum
CREATE TYPE "EvidenceAuthority" AS ENUM ('AUTHORITATIVE', 'PROVISIONAL_AUTHORITATIVE', 'AUXILIARY');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('DISCOVERED', 'PENDING', 'VALIDATED', 'REJECTED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "RuleScope" AS ENUM ('SYSTEM_DEFAULT', 'MERCHANT_DEFAULT', 'USER_GLOBAL', 'USER_MERCHANT', 'USER_CAMPAIGN');

-- CreateEnum
CREATE TYPE "LedgerAccountKind" AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('COMMISSION_PENDING', 'COMMISSION_VALIDATED', 'CASHBACK_RELEASE', 'CONVERSION_REVERSAL', 'PAYOUT_RESERVE', 'PAYOUT_RELEASE', 'PAYOUT_PAID', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RiskHoldStatus" AS ENUM ('HELD', 'RELEASED', 'CANCELLED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "BeneficiaryStatus" AS ENUM ('PENDING', 'VERIFIED', 'BLOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('DRAFT', 'RESERVED', 'REVIEWED', 'APPROVED', 'SUBMITTED', 'PROCESSING', 'PAID', 'FAILED', 'UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('REVIEW', 'APPROVE', 'ADJUSTMENT');

CREATE TYPE "AdjustmentStatus" AS ENUM ('DRAFT', 'REVIEWED', 'APPROVED', 'POSTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'MATCHED', 'ADJUSTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "inviteCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Authenticator" (
    "credentialID" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("userId","credentialID")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "grantedByUserId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPasskey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "AdminPasskey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "defaultShareBps" INTEGER NOT NULL DEFAULT 5000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "externalId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateAccount" (
    "id" TEXT NOT NULL,
    "connectorType" "ConnectorType" NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL,
    "clickToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "affiliateAccountId" TEXT,
    "platform" "Platform" NOT NULL,
    "targetType" "AffiliateTargetType" NOT NULL,
    "originUrl" TEXT NOT NULL,
    "outboundUrl" TEXT,
    "subIds" JSONB NOT NULL,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clickedAt" TIMESTAMP(3),

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributionSnapshot" (
    "id" TEXT NOT NULL,
    "clickId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "ruleVersionId" TEXT,
    "shareBps" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferSnapshot" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "provider" "ConnectorType" NOT NULL,
    "externalOfferId" TEXT NOT NULL,
    "merchantCode" TEXT,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "originUrl" TEXT NOT NULL,
    "priceVnd" BIGINT,
    "originalPriceVnd" BIGINT,
    "commissionBps" INTEGER,
    "authority" "EvidenceAuthority" NOT NULL DEFAULT 'AUXILIARY',
    "payload" JSONB NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "quarantinedAt" TIMESTAMP(3),
    "quarantineReason" TEXT,

    CONSTRAINT "OfferSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorConfig" (
    "id" TEXT NOT NULL,
    "affiliateAccountId" TEXT,
    "connectorType" "ConnectorType" NOT NULL,
    "platform" "Platform" NOT NULL,
    "mode" "ConnectorMode" NOT NULL DEFAULT 'DISABLED',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorCursor" (
    "id" TEXT NOT NULL,
    "connectorConfigId" TEXT NOT NULL,
    "cursorKey" TEXT NOT NULL,
    "cursorValue" TEXT,
    "windowEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorHealth" (
    "id" TEXT NOT NULL,
    "connectorConfigId" TEXT NOT NULL,
    "status" "ConnectorMode" NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lagSeconds" INTEGER,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "details" JSONB,

    CONSTRAINT "ConnectorHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "connectorConfigId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'QUEUED',
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "cursorBefore" TEXT,
    "cursorAfter" TEXT,
    "receivedCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawEvidence" (
    "id" TEXT NOT NULL,
    "provider" "ConnectorType" NOT NULL,
    "kind" TEXT NOT NULL,
    "authority" "EvidenceAuthority" NOT NULL,
    "sha256" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "externalRef" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalConversionIdentity" (
    "id" TEXT NOT NULL,
    "source" "ConnectorType" NOT NULL,
    "affiliateAccountId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "externalItemKey" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalConversionIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversion" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "clickId" TEXT,
    "merchantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "platform" "Platform" NOT NULL,
    "status" "ConversionStatus" NOT NULL DEFAULT 'DISCOVERED',
    "sourceAuthority" "EvidenceAuthority" NOT NULL,
    "grossCommissionVnd" BIGINT NOT NULL,
    "netCommissionVnd" BIGINT NOT NULL,
    "cashbackVnd" BIGINT NOT NULL,
    "shareBps" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "clickedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rawEvidenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionItem" (
    "id" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "name" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceVnd" BIGINT,
    "commissionVnd" BIGINT NOT NULL,
    "cashbackVnd" BIGINT NOT NULL,
    "payload" JSONB,

    CONSTRAINT "ConversionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionRevision" (
    "id" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "previousStatus" "ConversionStatus" NOT NULL,
    "newStatus" "ConversionStatus" NOT NULL,
    "previousCommissionVnd" BIGINT NOT NULL,
    "newCommissionVnd" BIGINT NOT NULL,
    "previousCashbackVnd" BIGINT NOT NULL,
    "newCashbackVnd" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "rawEvidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationCase" (
    "id" TEXT NOT NULL,
    "conversionId" TEXT,
    "platform" "Platform" NOT NULL,
    "externalOrderId" TEXT,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceSummary" JSONB NOT NULL,
    "resolution" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "scope" "RuleScope" NOT NULL,
    "userId" TEXT,
    "merchantId" TEXT,
    "campaignId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "shareBps" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LedgerAccountKind" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "type" "LedgerTransactionType" NOT NULL,
    "reference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amountVnd" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletProjection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pendingVnd" BIGINT NOT NULL DEFAULT 0,
    "availableVnd" BIGINT NOT NULL DEFAULT 0,
    "reservedVnd" BIGINT NOT NULL DEFAULT 0,
    "paidVnd" BIGINT NOT NULL DEFAULT 0,
    "version" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "amountVnd" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RiskHoldStatus" NOT NULL DEFAULT 'HELD',
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankBeneficiary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankBin" TEXT NOT NULL,
    "accountNumberCipher" TEXT NOT NULL,
    "accountNameCipher" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "encryptionKeyVersion" INTEGER NOT NULL,
    "status" "BeneficiaryStatus" NOT NULL DEFAULT 'PENDING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankBeneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficiaryChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "previousLast4" TEXT,
    "newLast4" TEXT NOT NULL,
    "holdUntil" TIMESTAMP(3) NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeneficiaryChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutTicket" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "amountVnd" BIGINT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PayoutTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutApproval" (
    "id" TEXT NOT NULL,
    "payoutTicketId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAttempt" (
    "id" TEXT NOT NULL,
    "payoutTicketId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerPayoutId" TEXT,
    "providerState" TEXT,
    "requestEvidenceId" TEXT,
    "responseEvidenceId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerId" TEXT,
    "errorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "value" JSONB,
    "description" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "requestId" TEXT,
    "ipHash" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceAdjustment" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "amountVnd" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");

-- CreateIndex
CREATE INDEX "BalanceAdjustment_status_createdAt_idx" ON "BalanceAdjustment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BalanceAdjustment_targetUserId_createdAt_idx" ON "BalanceAdjustment"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");

-- CreateIndex
CREATE INDEX "RoleAssignment_role_idx" ON "RoleAssignment"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_userId_role_key" ON "RoleAssignment"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AdminPasskey_credentialId_key" ON "AdminPasskey"("credentialId");

-- CreateIndex
CREATE INDEX "AdminPasskey_userId_idx" ON "AdminPasskey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCode_codeHash_key" ON "RecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_slug_key" ON "Merchant"("slug");

-- CreateIndex
CREATE INDEX "Merchant_platform_active_idx" ON "Merchant"("platform", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_platform_code_key" ON "Merchant"("platform", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_merchantId_active_idx" ON "Campaign"("merchantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_merchantId_externalId_key" ON "Campaign"("merchantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateAccount_connectorType_platform_externalAccountId_key" ON "AffiliateAccount"("connectorType", "platform", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateClick_clickToken_key" ON "AffiliateClick"("clickToken");

-- CreateIndex
CREATE INDEX "AffiliateClick_userId_createdAt_idx" ON "AffiliateClick"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateClick_merchantId_createdAt_idx" ON "AffiliateClick"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateClick_platform_createdAt_idx" ON "AffiliateClick"("platform", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttributionSnapshot_clickId_key" ON "AttributionSnapshot"("clickId");

-- CreateIndex
CREATE INDEX "AttributionSnapshot_merchantId_campaignId_idx" ON "AttributionSnapshot"("merchantId", "campaignId");

-- CreateIndex
CREATE INDEX "OfferSnapshot_platform_fetchedAt_idx" ON "OfferSnapshot"("platform", "fetchedAt");

-- CreateIndex
CREATE INDEX "OfferSnapshot_expiresAt_idx" ON "OfferSnapshot"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfferSnapshot_provider_externalOfferId_key" ON "OfferSnapshot"("provider", "externalOfferId");

-- CreateIndex
CREATE INDEX "ConnectorConfig_enabled_mode_idx" ON "ConnectorConfig"("enabled", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorConfig_connectorType_platform_affiliateAccountId_key" ON "ConnectorConfig"("connectorType", "platform", "affiliateAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorCursor_connectorConfigId_cursorKey_key" ON "ConnectorCursor"("connectorConfigId", "cursorKey");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorHealth_connectorConfigId_key" ON "ConnectorHealth"("connectorConfigId");

-- CreateIndex
CREATE INDEX "SyncRun_connectorConfigId_createdAt_idx" ON "SyncRun"("connectorConfigId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncRun_status_createdAt_idx" ON "SyncRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RawEvidence_provider_externalRef_idx" ON "RawEvidence"("provider", "externalRef");

-- CreateIndex
CREATE INDEX "RawEvidence_sha256_idx" ON "RawEvidence"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "RawEvidence_objectKey_key" ON "RawEvidence"("objectKey");

-- CreateIndex
CREATE INDEX "ExternalConversionIdentity_conversionId_idx" ON "ExternalConversionIdentity"("conversionId");

-- CreateIndex
CREATE INDEX "ExternalConversionIdentity_externalOrderId_idx" ON "ExternalConversionIdentity"("externalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalConversionIdentity_source_affiliateAccountId_extern_key" ON "ExternalConversionIdentity"("source", "affiliateAccountId", "externalOrderId", "externalItemKey");

-- CreateIndex
CREATE INDEX "Conversion_userId_status_purchasedAt_idx" ON "Conversion"("userId", "status", "purchasedAt");

-- CreateIndex
CREATE INDEX "Conversion_platform_status_purchasedAt_idx" ON "Conversion"("platform", "status", "purchasedAt");

-- CreateIndex
CREATE INDEX "Conversion_clickId_idx" ON "Conversion"("clickId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionItem_conversionId_externalItemId_key" ON "ConversionItem"("conversionId", "externalItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionRevision_conversionId_sequence_key" ON "ConversionRevision"("conversionId", "sequence");

-- CreateIndex
CREATE INDEX "ReconciliationCase_status_createdAt_idx" ON "ReconciliationCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReconciliationCase_conversionId_idx" ON "ReconciliationCase"("conversionId");

-- CreateIndex
CREATE INDEX "CommissionRule_scope_active_idx" ON "CommissionRule"("scope", "active");

-- CreateIndex
CREATE INDEX "CommissionRule_userId_merchantId_campaignId_idx" ON "CommissionRule"("userId", "merchantId", "campaignId");

-- CreateIndex
CREATE INDEX "CommissionRuleVersion_validFrom_validTo_idx" ON "CommissionRuleVersion"("validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRuleVersion_ruleId_version_key" ON "CommissionRuleVersion"("ruleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

-- CreateIndex
CREATE INDEX "LedgerAccount_userId_active_idx" ON "LedgerAccount"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_idempotencyKey_key" ON "LedgerTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerTransaction_reference_idx" ON "LedgerTransaction"("reference");

-- CreateIndex
CREATE INDEX "LedgerTransaction_createdAt_idx" ON "LedgerTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_createdAt_idx" ON "LedgerEntry"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletProjection_userId_key" ON "WalletProjection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskHold_conversionId_key" ON "RiskHold"("conversionId");

-- CreateIndex
CREATE INDEX "RiskHold_status_releaseAt_idx" ON "RiskHold"("status", "releaseAt");

-- CreateIndex
CREATE INDEX "BankBeneficiary_userId_active_idx" ON "BankBeneficiary"("userId", "active");

-- CreateIndex
CREATE INDEX "BeneficiaryChange_userId_createdAt_idx" ON "BeneficiaryChange"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutTicket_reference_key" ON "PayoutTicket"("reference");

-- CreateIndex
CREATE INDEX "PayoutTicket_userId_createdAt_idx" ON "PayoutTicket"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutTicket_status_createdAt_idx" ON "PayoutTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutApproval_actorUserId_createdAt_idx" ON "PayoutApproval"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutApproval_payoutTicketId_kind_key" ON "PayoutApproval"("payoutTicketId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAttempt_idempotencyKey_key" ON "PayoutAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAttempt_payoutTicketId_attemptNumber_key" ON "PayoutAttempt"("payoutTicketId", "attemptNumber");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_idempotencyKey_key" ON "OutboxEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_namespace_idempotencyKey_key" ON "IdempotencyRecord"("namespace", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPasskey" ADD CONSTRAINT "AdminPasskey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_affiliateAccountId_fkey" FOREIGN KEY ("affiliateAccountId") REFERENCES "AffiliateAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionSnapshot" ADD CONSTRAINT "AttributionSnapshot_clickId_fkey" FOREIGN KEY ("clickId") REFERENCES "AffiliateClick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionSnapshot" ADD CONSTRAINT "AttributionSnapshot_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionSnapshot" ADD CONSTRAINT "AttributionSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionSnapshot" ADD CONSTRAINT "AttributionSnapshot_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "CommissionRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorConfig" ADD CONSTRAINT "ConnectorConfig_affiliateAccountId_fkey" FOREIGN KEY ("affiliateAccountId") REFERENCES "AffiliateAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorCursor" ADD CONSTRAINT "ConnectorCursor_connectorConfigId_fkey" FOREIGN KEY ("connectorConfigId") REFERENCES "ConnectorConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorHealth" ADD CONSTRAINT "ConnectorHealth_connectorConfigId_fkey" FOREIGN KEY ("connectorConfigId") REFERENCES "ConnectorConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_connectorConfigId_fkey" FOREIGN KEY ("connectorConfigId") REFERENCES "ConnectorConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalConversionIdentity" ADD CONSTRAINT "ExternalConversionIdentity_affiliateAccountId_fkey" FOREIGN KEY ("affiliateAccountId") REFERENCES "AffiliateAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalConversionIdentity" ADD CONSTRAINT "ExternalConversionIdentity_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_clickId_fkey" FOREIGN KEY ("clickId") REFERENCES "AffiliateClick"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_rawEvidenceId_fkey" FOREIGN KEY ("rawEvidenceId") REFERENCES "RawEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionItem" ADD CONSTRAINT "ConversionItem_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionRevision" ADD CONSTRAINT "ConversionRevision_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRuleVersion" ADD CONSTRAINT "CommissionRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRuleVersion" ADD CONSTRAINT "CommissionRuleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletProjection" ADD CONSTRAINT "WalletProjection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskHold" ADD CONSTRAINT "RiskHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskHold" ADD CONSTRAINT "RiskHold_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankBeneficiary" ADD CONSTRAINT "BankBeneficiary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryChange" ADD CONSTRAINT "BeneficiaryChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryChange" ADD CONSTRAINT "BeneficiaryChange_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "BankBeneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutTicket" ADD CONSTRAINT "PayoutTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutTicket" ADD CONSTRAINT "PayoutTicket_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "BankBeneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutApproval" ADD CONSTRAINT "PayoutApproval_payoutTicketId_fkey" FOREIGN KEY ("payoutTicketId") REFERENCES "PayoutTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutApproval" ADD CONSTRAINT "PayoutApproval_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_payoutTicketId_fkey" FOREIGN KEY ("payoutTicketId") REFERENCES "PayoutTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants that are intentionally stronger than the Prisma model.
ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_amountVnd_positive" CHECK ("amountVnd" > 0);

ALTER TABLE "CommissionRuleVersion"
  ADD CONSTRAINT "CommissionRuleVersion_shareBps_range" CHECK ("shareBps" BETWEEN 0 AND 10000);

ALTER TABLE "AttributionSnapshot"
  ADD CONSTRAINT "AttributionSnapshot_shareBps_range" CHECK ("shareBps" BETWEEN 0 AND 10000);

ALTER TABLE "BalanceAdjustment"
  ADD CONSTRAINT "BalanceAdjustment_amountVnd_nonzero" CHECK ("amountVnd" <> 0);

ALTER TABLE "Conversion"
  ADD CONSTRAINT "Conversion_shareBps_range" CHECK ("shareBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "Conversion_money_nonnegative" CHECK (
    "grossCommissionVnd" >= 0 AND
    "netCommissionVnd" >= 0 AND
    "cashbackVnd" >= 0
  );

ALTER TABLE "WalletProjection"
  ADD CONSTRAINT "WalletProjection_balances_nonnegative" CHECK (
    "pendingVnd" >= 0 AND
    "availableVnd" >= 0 AND
    "reservedVnd" >= 0 AND
    "paidVnd" >= 0
  );

ALTER TABLE "PayoutTicket"
  ADD CONSTRAINT "PayoutTicket_amountVnd_positive" CHECK ("amountVnd" > 0);

CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ledger rows are append-only';
END;
$$;

CREATE TRIGGER "LedgerTransaction_append_only"
BEFORE UPDATE OR DELETE ON "LedgerTransaction"
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TRIGGER "LedgerEntry_append_only"
BEFORE UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE OR REPLACE FUNCTION enforce_ledger_transaction_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction_id text;
  signed_total numeric;
BEGIN
  target_transaction_id := COALESCE(NEW."transactionId", OLD."transactionId");

  SELECT COALESCE(
    SUM(
      CASE
        WHEN "direction" = 'DEBIT' THEN "amountVnd"
        ELSE -"amountVnd"
      END
    ),
    0
  )
  INTO signed_total
  FROM "LedgerEntry"
  WHERE "transactionId" = target_transaction_id;

  IF signed_total <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is not balanced: %', target_transaction_id, signed_total;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LedgerEntry_balanced_transaction"
AFTER INSERT OR UPDATE OR DELETE ON "LedgerEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_ledger_transaction_balance();

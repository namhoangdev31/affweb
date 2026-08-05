-- Additive tenant finance and portal hierarchy expansion.
ALTER TYPE "LedgerTransactionType" ADD VALUE 'TENANT_FUNDING';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'TENANT_WALLET_ALLOCATION';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'TENANT_WALLET_TRANSFER';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'TENANT_PAYOUT_RESERVE';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'TENANT_PAYOUT_RELEASE';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'TENANT_PAYOUT_PAID';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'TENANT_RECOVERY';

CREATE TYPE "TenantKind" AS ENUM ('MASTER', 'STANDARD');
CREATE TYPE "TenantObligationStatus" AS ENUM (
  'PENDING_FUNDING',
  'AVAILABLE',
  'RESERVED',
  'PAID',
  'CANCELLED',
  'RECOVERY_REQUIRED'
);
CREATE TYPE "TenantFundingOrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'FAILED');
CREATE TYPE "TenantPayoutKind" AS ENUM ('MEMBER_WITHDRAWAL', 'TREASURY_WITHDRAWAL');
CREATE TYPE "TenantPayoutStatus" AS ENUM (
  'RESERVED',
  'SUBMITTED',
  'PROCESSING',
  'PAID',
  'FAILED',
  'UNKNOWN',
  'CANCELLED'
);

CREATE SEQUENCE "TenantFundingOrder_order_code_seq" START 100000000 INCREMENT 1;

ALTER TABLE "Tenant"
  ADD COLUMN "kind" "TenantKind" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "financeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "topupEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoPayoutEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Tenant_kind_idx" ON "Tenant"("kind");
CREATE UNIQUE INDEX "Tenant_single_master_key" ON "Tenant"("kind") WHERE "kind" = 'MASTER';

CREATE TABLE "TenantTreasuryProjection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "availableVnd" BIGINT NOT NULL DEFAULT 0,
  "reservedVnd" BIGINT NOT NULL DEFAULT 0,
  "paidVnd" BIGINT NOT NULL DEFAULT 0,
  "withdrawnVnd" BIGINT NOT NULL DEFAULT 0,
  "version" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantTreasuryProjection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantTreasuryProjection_nonnegative" CHECK (
    "availableVnd" >= 0 AND "reservedVnd" >= 0 AND "paidVnd" >= 0 AND "withdrawnVnd" >= 0
  )
);

CREATE TABLE "TenantMemberWalletProjection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pendingFundingVnd" BIGINT NOT NULL DEFAULT 0,
  "availableVnd" BIGINT NOT NULL DEFAULT 0,
  "reservedVnd" BIGINT NOT NULL DEFAULT 0,
  "paidVnd" BIGINT NOT NULL DEFAULT 0,
  "recoveryVnd" BIGINT NOT NULL DEFAULT 0,
  "version" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantMemberWalletProjection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantMemberWalletProjection_nonnegative" CHECK (
    "pendingFundingVnd" >= 0 AND "availableVnd" >= 0 AND "reservedVnd" >= 0 AND
    "paidVnd" >= 0 AND "recoveryVnd" >= 0
  )
);

CREATE TABLE "TenantCashbackObligation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversionId" TEXT NOT NULL,
  "amountVnd" BIGINT NOT NULL,
  "fundedVnd" BIGINT NOT NULL DEFAULT 0,
  "recoveredVnd" BIGINT NOT NULL DEFAULT 0,
  "recoveryRequiredVnd" BIGINT NOT NULL DEFAULT 0,
  "reservedVnd" BIGINT NOT NULL DEFAULT 0,
  "paidVnd" BIGINT NOT NULL DEFAULT 0,
  "status" "TenantObligationStatus" NOT NULL DEFAULT 'PENDING_FUNDING',
  "fundedAt" TIMESTAMP(3),
  "reservedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantCashbackObligation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantCashbackObligation_amount_nonnegative" CHECK (
    "amountVnd" >= 0 AND "fundedVnd" >= 0 AND "recoveredVnd" >= 0 AND
    "recoveryRequiredVnd" >= 0 AND "reservedVnd" >= 0 AND "paidVnd" >= 0
  )
);

CREATE TABLE "TenantFundingOrder" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "orderCode" INTEGER NOT NULL,
  "amountVnd" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "status" "TenantFundingOrderStatus" NOT NULL DEFAULT 'PENDING',
  "description" TEXT NOT NULL,
  "paymentLinkId" TEXT,
  "checkoutUrl" TEXT,
  "qrCode" TEXT,
  "clientIdempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantFundingOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantFundingOrder_amount_positive" CHECK ("amountVnd" > 0),
  CONSTRAINT "TenantFundingOrder_currency_vnd" CHECK ("currency" = 'VND')
);

CREATE TABLE "TenantPayout" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "beneficiaryId" TEXT NOT NULL,
  "kind" "TenantPayoutKind" NOT NULL,
  "amountVnd" BIGINT NOT NULL,
  "status" "TenantPayoutStatus" NOT NULL DEFAULT 'RESERVED',
  "clientIdempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "bankBinSnapshot" TEXT NOT NULL,
  "accountLast4Snapshot" TEXT NOT NULL,
  "accountNumberCipherSnapshot" TEXT NOT NULL,
  "accountNameCipherSnapshot" TEXT NOT NULL,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "submittedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantPayout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantPayout_amount_positive" CHECK ("amountVnd" > 0)
);

CREATE TABLE "TenantPayoutAttempt" (
  "id" TEXT NOT NULL,
  "tenantPayoutId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "providerPayoutId" TEXT,
  "providerState" TEXT,
  "requestEvidenceId" TEXT,
  "responseEvidenceId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantPayoutAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantPayoutAllocation" (
  "id" TEXT NOT NULL,
  "tenantPayoutId" TEXT NOT NULL,
  "obligationId" TEXT NOT NULL,
  "amountVnd" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantPayoutAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantPayoutAllocation_amount_positive" CHECK ("amountVnd" > 0)
);

CREATE UNIQUE INDEX "TenantTreasuryProjection_tenantId_key" ON "TenantTreasuryProjection"("tenantId");
CREATE UNIQUE INDEX "TenantMemberWalletProjection_tenantId_userId_key" ON "TenantMemberWalletProjection"("tenantId", "userId");
CREATE INDEX "TenantMemberWalletProjection_userId_idx" ON "TenantMemberWalletProjection"("userId");
CREATE UNIQUE INDEX "TenantCashbackObligation_conversionId_key" ON "TenantCashbackObligation"("conversionId");
CREATE INDEX "TenantCashbackObligation_tenantId_status_createdAt_id_idx" ON "TenantCashbackObligation"("tenantId", "status", "createdAt", "id");
CREATE INDEX "TenantCashbackObligation_userId_status_idx" ON "TenantCashbackObligation"("userId", "status");
CREATE UNIQUE INDEX "TenantFundingOrder_orderCode_key" ON "TenantFundingOrder"("orderCode");
CREATE UNIQUE INDEX "TenantFundingOrder_tenantId_clientIdempotencyKey_key" ON "TenantFundingOrder"("tenantId", "clientIdempotencyKey");
CREATE INDEX "TenantFundingOrder_tenantId_createdAt_idx" ON "TenantFundingOrder"("tenantId", "createdAt");
CREATE INDEX "TenantFundingOrder_status_expiresAt_idx" ON "TenantFundingOrder"("status", "expiresAt");
CREATE UNIQUE INDEX "TenantPayout_reference_key" ON "TenantPayout"("reference");
CREATE UNIQUE INDEX "TenantPayout_tenantId_userId_clientIdempotencyKey_key" ON "TenantPayout"("tenantId", "userId", "clientIdempotencyKey");
CREATE INDEX "TenantPayout_tenantId_status_createdAt_idx" ON "TenantPayout"("tenantId", "status", "createdAt");
CREATE INDEX "TenantPayout_userId_createdAt_idx" ON "TenantPayout"("userId", "createdAt");
CREATE UNIQUE INDEX "TenantPayoutAttempt_idempotencyKey_key" ON "TenantPayoutAttempt"("idempotencyKey");
CREATE UNIQUE INDEX "TenantPayoutAttempt_tenantPayoutId_attemptNumber_key" ON "TenantPayoutAttempt"("tenantPayoutId", "attemptNumber");
CREATE UNIQUE INDEX "TenantPayoutAllocation_tenantPayoutId_obligationId_key" ON "TenantPayoutAllocation"("tenantPayoutId", "obligationId");
CREATE INDEX "TenantPayoutAllocation_obligationId_idx" ON "TenantPayoutAllocation"("obligationId");

ALTER TABLE "TenantTreasuryProjection" ADD CONSTRAINT "TenantTreasuryProjection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantMemberWalletProjection" ADD CONSTRAINT "TenantMemberWalletProjection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantMemberWalletProjection" ADD CONSTRAINT "TenantMemberWalletProjection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantCashbackObligation" ADD CONSTRAINT "TenantCashbackObligation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantCashbackObligation" ADD CONSTRAINT "TenantCashbackObligation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantCashbackObligation" ADD CONSTRAINT "TenantCashbackObligation_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantFundingOrder" ADD CONSTRAINT "TenantFundingOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantFundingOrder" ADD CONSTRAINT "TenantFundingOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayout" ADD CONSTRAINT "TenantPayout_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "BankBeneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayoutAttempt" ADD CONSTRAINT "TenantPayoutAttempt_tenantPayoutId_fkey" FOREIGN KEY ("tenantPayoutId") REFERENCES "TenantPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayoutAllocation" ADD CONSTRAINT "TenantPayoutAllocation_tenantPayoutId_fkey" FOREIGN KEY ("tenantPayoutId") REFERENCES "TenantPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayoutAllocation" ADD CONSTRAINT "TenantPayoutAllocation_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "TenantCashbackObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

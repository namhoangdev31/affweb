CREATE TYPE "OrderValidationStatus" AS ENUM (
  'TRACKED',
  'DELIVERED',
  'VALIDATION_HOLD',
  'VALIDATED',
  'REJECTED',
  'RETURNED',
  'CANCELLED',
  'REVIEW_REQUIRED'
);

CREATE TYPE "SettlementStatus" AS ENUM (
  'UNBILLED',
  'INCLUDED_IN_RECONCILIATION',
  'RECONCILIATION_CLOSED',
  'FINANCE_CONFIRMED',
  'RELEASED',
  'REVERSED',
  'REVIEW_REQUIRED'
);

CREATE TYPE "SettlementBatchStatus" AS ENUM (
  'DRAFT',
  'REVIEW_REQUIRED',
  'CLOSED',
  'RELEASED',
  'REVERSED'
);

CREATE TYPE "SettlementLineStatus" AS ENUM (
  'PENDING',
  'MATCHED',
  'QUARANTINED',
  'RELEASED',
  'REVERSED'
);

CREATE TYPE "ProviderAccountScope" AS ENUM ('PLATFORM_MANAGED', 'TENANT_MANAGED');
CREATE TYPE "ProviderCredentialStatus" AS ENUM ('PENDING', 'ACTIVE', 'INVALID', 'REVOKED');
CREATE TYPE "ZaloRoutingMode" AS ENUM ('DIRECT', 'ACCESSTRADE_CAMPAIGN');

ALTER TABLE "AffiliateAccount"
  ADD COLUMN "scope" "ProviderAccountScope" NOT NULL DEFAULT 'PLATFORM_MANAGED',
  ADD COLUMN "tenantId" TEXT,
  ADD COLUMN "fingerprint" TEXT,
  ADD COLUMN "validationHoldDays" INTEGER,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

ALTER TABLE "Conversion"
  ADD COLUMN "orderValidationStatus" "OrderValidationStatus" NOT NULL DEFAULT 'TRACKED',
  ADD COLUMN "settlementStatus" "SettlementStatus" NOT NULL DEFAULT 'UNBILLED',
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "validationDueAt" TIMESTAMP(3),
  ADD COLUMN "validationHoldDays" INTEGER,
  ADD COLUMN "rawOrderStatus" TEXT,
  ADD COLUMN "orderStatusUpdatedAt" TIMESTAMP(3);

ALTER TABLE "ZaloGroupBinding"
  ADD COLUMN "routingMode" "ZaloRoutingMode" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "accessTradeCampaignId" TEXT;

CREATE TABLE "ProviderCredential" (
  "id" TEXT NOT NULL,
  "affiliateAccountId" TEXT NOT NULL,
  "encryptedPayload" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL,
  "status" "ProviderCredentialStatus" NOT NULL DEFAULT 'PENDING',
  "createdByUserId" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SettlementEvidence" (
  "id" TEXT NOT NULL,
  "affiliateAccountId" TEXT NOT NULL,
  "rawEvidenceId" TEXT NOT NULL,
  "fileSha256" TEXT NOT NULL,
  "provider" "ConnectorType" NOT NULL,
  "kind" TEXT NOT NULL,
  "externalReference" TEXT,
  "importedByUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SettlementBatch" (
  "id" TEXT NOT NULL,
  "affiliateAccountId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "provider" "ConnectorType" NOT NULL,
  "externalReference" TEXT NOT NULL,
  "status" "SettlementBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAmountVnd" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "closedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SettlementLine" (
  "id" TEXT NOT NULL,
  "settlementBatchId" TEXT NOT NULL,
  "conversionId" TEXT NOT NULL,
  "externalOrderId" TEXT NOT NULL,
  "externalItemKey" TEXT NOT NULL,
  "amountVnd" BIGINT NOT NULL,
  "status" "SettlementLineStatus" NOT NULL DEFAULT 'PENDING',
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

UPDATE "Conversion"
SET
  "orderValidationStatus" = CASE
    WHEN "availableAt" IS NOT NULL THEN 'VALIDATED'::"OrderValidationStatus"
    WHEN "status" = 'VALIDATED' THEN 'REVIEW_REQUIRED'::"OrderValidationStatus"
    WHEN "status" = 'REJECTED' THEN 'REJECTED'::"OrderValidationStatus"
    WHEN "status" = 'CORRECTED' THEN 'REVIEW_REQUIRED'::"OrderValidationStatus"
    ELSE 'TRACKED'::"OrderValidationStatus"
  END,
  "settlementStatus" = CASE
    WHEN "availableAt" IS NOT NULL THEN 'RELEASED'::"SettlementStatus"
    ELSE 'UNBILLED'::"SettlementStatus"
  END,
  "validationHoldDays" = NULL;

INSERT INTO "AuditLog" (
  "id",
  "action",
  "entityType",
  "entityId",
  "after",
  "createdAt"
)
SELECT
  'legacy-release-' || md5("id"),
  'conversion.settlement_legacy_backfill',
  'Conversion',
  "id",
  jsonb_build_object(
    'settlementStatus',
    'RELEASED',
    'reason',
    'LEGACY_RELEASE'
  ),
  CURRENT_TIMESTAMP
FROM "Conversion"
WHERE "availableAt" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "SubscriptionPlan"
SET
  "allowApiCredentials" = true,
  "allowedConnectors" = '["SHOPEE_DIRECT","LAZADA_OPEN_API","ACCESSTRADE_API"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN ('PREMIUM_399K', 'PREMIUM_YEARLY');

CREATE UNIQUE INDEX "ProviderCredential_affiliateAccountId_version_key"
  ON "ProviderCredential"("affiliateAccountId", "version");
CREATE INDEX "ProviderCredential_affiliateAccountId_status_createdAt_idx"
  ON "ProviderCredential"("affiliateAccountId", "status", "createdAt");
CREATE UNIQUE INDEX "SettlementEvidence_rawEvidenceId_key"
  ON "SettlementEvidence"("rawEvidenceId");
CREATE INDEX "SettlementEvidence_affiliateAccountId_createdAt_idx"
  ON "SettlementEvidence"("affiliateAccountId", "createdAt");
CREATE INDEX "SettlementEvidence_provider_externalReference_idx"
  ON "SettlementEvidence"("provider", "externalReference");
CREATE INDEX "SettlementEvidence_fileSha256_idx"
  ON "SettlementEvidence"("fileSha256");
CREATE UNIQUE INDEX "SettlementBatch_evidenceId_key"
  ON "SettlementBatch"("evidenceId");
CREATE UNIQUE INDEX "SettlementBatch_idempotencyKey_key"
  ON "SettlementBatch"("idempotencyKey");
CREATE UNIQUE INDEX "SettlementBatch_affiliateAccountId_externalReference_key"
  ON "SettlementBatch"("affiliateAccountId", "externalReference");
CREATE INDEX "SettlementBatch_status_createdAt_idx"
  ON "SettlementBatch"("status", "createdAt");
CREATE UNIQUE INDEX "SettlementLine_settlementBatchId_conversionId_key"
  ON "SettlementLine"("settlementBatchId", "conversionId");
CREATE UNIQUE INDEX "SettlementLine_settlementBatchId_externalOrderId_externalItemKey_key"
  ON "SettlementLine"("settlementBatchId", "externalOrderId", "externalItemKey");
CREATE UNIQUE INDEX "SettlementLine_conversionId_key"
  ON "SettlementLine"("conversionId");
CREATE INDEX "SettlementLine_status_createdAt_idx"
  ON "SettlementLine"("status", "createdAt");
CREATE INDEX "AffiliateAccount_scope_tenantId_enabled_idx"
  ON "AffiliateAccount"("scope", "tenantId", "enabled");
CREATE INDEX "Conversion_orderValidationStatus_validationDueAt_idx"
  ON "Conversion"("orderValidationStatus", "validationDueAt");
CREATE INDEX "Conversion_settlementStatus_purchasedAt_idx"
  ON "Conversion"("settlementStatus", "purchasedAt");
CREATE INDEX "ZaloGroupBinding_accessTradeCampaignId_idx"
  ON "ZaloGroupBinding"("accessTradeCampaignId");

ALTER TABLE "AffiliateAccount"
  ADD CONSTRAINT "AffiliateAccount_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderCredential"
  ADD CONSTRAINT "ProviderCredential_affiliateAccountId_fkey"
  FOREIGN KEY ("affiliateAccountId") REFERENCES "AffiliateAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderCredential"
  ADD CONSTRAINT "ProviderCredential_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementEvidence"
  ADD CONSTRAINT "SettlementEvidence_affiliateAccountId_fkey"
  FOREIGN KEY ("affiliateAccountId") REFERENCES "AffiliateAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementEvidence"
  ADD CONSTRAINT "SettlementEvidence_rawEvidenceId_fkey"
  FOREIGN KEY ("rawEvidenceId") REFERENCES "RawEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementEvidence"
  ADD CONSTRAINT "SettlementEvidence_importedByUserId_fkey"
  FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SettlementBatch"
  ADD CONSTRAINT "SettlementBatch_affiliateAccountId_fkey"
  FOREIGN KEY ("affiliateAccountId") REFERENCES "AffiliateAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementBatch"
  ADD CONSTRAINT "SettlementBatch_evidenceId_fkey"
  FOREIGN KEY ("evidenceId") REFERENCES "SettlementEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementBatch"
  ADD CONSTRAINT "SettlementBatch_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementLine"
  ADD CONSTRAINT "SettlementLine_settlementBatchId_fkey"
  FOREIGN KEY ("settlementBatchId") REFERENCES "SettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementLine"
  ADD CONSTRAINT "SettlementLine_conversionId_fkey"
  FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZaloGroupBinding"
  ADD CONSTRAINT "ZaloGroupBinding_accessTradeCampaignId_fkey"
  FOREIGN KEY ("accessTradeCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliateAccount"
  ADD CONSTRAINT "AffiliateAccount_scope_tenant_consistent"
  CHECK (
    ("scope" = 'PLATFORM_MANAGED' AND "tenantId" IS NULL) OR
    ("scope" = 'TENANT_MANAGED' AND "tenantId" IS NOT NULL)
  ),
  ADD CONSTRAINT "AffiliateAccount_validation_hold_days_valid"
  CHECK ("validationHoldDays" IS NULL OR "validationHoldDays" BETWEEN 4 AND 60);

ALTER TABLE "Conversion"
  ADD CONSTRAINT "Conversion_validation_hold_days_valid"
  CHECK ("validationHoldDays" IS NULL OR "validationHoldDays" BETWEEN 4 AND 60);

ALTER TABLE "SettlementBatch"
  ADD CONSTRAINT "SettlementBatch_total_amount_positive"
  CHECK ("totalAmountVnd" > 0),
  ADD CONSTRAINT "SettlementBatch_vnd_only"
  CHECK ("currency" = 'VND');

ALTER TABLE "SettlementLine"
  ADD CONSTRAINT "SettlementLine_amount_positive"
  CHECK ("amountVnd" > 0);

CREATE OR REPLACE FUNCTION prevent_settlement_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'settlement evidence is append-only';
END;
$$;

CREATE TRIGGER "SettlementEvidence_append_only"
BEFORE UPDATE OR DELETE ON "SettlementEvidence"
FOR EACH ROW EXECUTE FUNCTION prevent_settlement_evidence_mutation();

INSERT INTO "FeatureFlag" ("id", "key", "enabled", "description", "createdAt", "updatedAt")
VALUES
  (
    'core-v1-accesstrade-kill-switch',
    'connector.accesstrade.enabled',
    false,
    'AccessTrade production connector kill switch.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'core-v1-lazada-kill-switch',
    'connector.lazada.enabled',
    false,
    'Lazada production connector kill switch.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'core-v1-provider-credentials',
    'provider.credentials.enabled',
    false,
    'Tenant and platform provider credential management.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'core-v1-shopee-orders-import',
    'shopee.orders_import.enabled',
    false,
    'Shopee Bill Conversion report import.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'core-v1-shopee-reconciliation',
    'shopee.reconciliation_import.enabled',
    false,
    'Shopee reconciliation invoice detail import; stays off until a real fixture exists.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO UPDATE
SET
  "enabled" = false,
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

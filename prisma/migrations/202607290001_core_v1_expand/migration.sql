CREATE TYPE "BillingCycle" AS ENUM ('TRIAL', 'MONTHLY', 'YEARLY');
CREATE TYPE "AffiliateAttributionMode" AS ENUM ('PLATFORM_USER', 'TENANT_MEMBER', 'TENANT_CHANNEL');
CREATE TYPE "TenantImportStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD';

CREATE SEQUENCE IF NOT EXISTS "SaaSInvoice_order_code_seq"
  AS BIGINT
  MINVALUE 1
  MAXVALUE 2000000000
  START WITH 1000000000
  NO CYCLE;

DO $$
DECLARE
  current_max BIGINT;
BEGIN
  SELECT COALESCE(MAX("orderCode"), 999999999) INTO current_max FROM "SaaSInvoice";
  IF current_max > 2000000000 THEN
    RAISE EXCEPTION 'Existing SaaSInvoice orderCode exceeds the Core v1 provider range';
  END IF;
  PERFORM setval(
    '"SaaSInvoice_order_code_seq"',
    GREATEST(current_max, 999999999) + 1,
    false
  );
END
$$;

ALTER TABLE "AffiliateClick"
  ADD COLUMN "attributionMode" "AffiliateAttributionMode" NOT NULL DEFAULT 'PLATFORM_USER',
  ADD COLUMN "clientIdempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT;

ALTER TABLE "PayoutTicket"
  ADD COLUMN "clientIdempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT;

ALTER TABLE "Tenant" ADD COLUMN "planCode" TEXT;

ALTER TABLE "SubscriptionPlan"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowZaloBot" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowedConnectors" JSONB,
  ADD COLUMN "billingCycle" "BillingCycle",
  ADD COLUMN "durationDays" INTEGER,
  ADD COLUMN "priceVnd" BIGINT,
  ALTER COLUMN "allowApiCredentials" SET DEFAULT false;

ALTER TABLE "SaaSInvoice"
  ADD COLUMN "amountVnd" BIGINT,
  ADD COLUMN "clientIdempotencyKey" TEXT,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'VND',
  ADD COLUMN "durationDays" INTEGER,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "failureMessage" TEXT,
  ADD COLUMN "planSnapshot" JSONB,
  ADD COLUMN "checkoutUrl" TEXT,
  ADD COLUMN "qrCode" TEXT,
  ADD COLUMN "requestHash" TEXT;

ALTER TABLE "ZaloGroupBinding"
  ADD COLUMN "chatIdCiphertext" BYTEA,
  ADD COLUMN "chatIdHash" TEXT;

CREATE TABLE "ZaloBindingCode" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZaloBindingCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantConversionImport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "rawEvidenceId" TEXT,
  "fileSha256" TEXT NOT NULL,
  "status" "TenantImportStatus" NOT NULL DEFAULT 'QUEUED',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "acceptedRows" INTEGER NOT NULL DEFAULT 0,
  "quarantinedRows" INTEGER NOT NULL DEFAULT 0,
  "duplicateRows" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "TenantConversionImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantSubscriptionAdjustment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previousPlanCode" TEXT,
  "newPlanCode" TEXT NOT NULL,
  "previousExpiresAt" TIMESTAMP(3) NOT NULL,
  "newExpiresAt" TIMESTAMP(3) NOT NULL,
  "previousStatus" "TenantStatus" NOT NULL,
  "newStatus" "TenantStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantSubscriptionAdjustment_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SubscriptionPlan" (
  "id", "code", "name", "priceMonthly", "priceVnd", "durationDays", "billingCycle",
  "maxUsers", "maxClicksPerMonth", "allowCustomDomain", "allowApiCredentials",
  "allowZaloBot", "allowedConnectors", "active", "updatedAt"
) VALUES
  ('plan_trial_14d', 'TRIAL_14D', 'Dùng thử 14 Ngày', 0, 0, 14, 'TRIAL', 100, 2000, false, false, true, '["SHOPEE_DIRECT"]', true, CURRENT_TIMESTAMP),
  ('plan_starter_99k', 'STARTER_99K', 'Gói Starter (Hàng tháng)', 99000, 99000, 30, 'MONTHLY', 500, 5000, false, false, false, '["SHOPEE_DIRECT"]', true, CURRENT_TIMESTAMP),
  ('plan_starter_yearly', 'STARTER_YEARLY', 'Gói Starter (Hàng năm)', 82500, 990000, 365, 'YEARLY', 500, 5000, false, false, false, '["SHOPEE_DIRECT"]', true, CURRENT_TIMESTAMP),
  ('plan_pro_199k', 'PRO_199K', 'Gói Pro (Hàng tháng)', 199000, 199000, 30, 'MONTHLY', 3000, 50000, false, false, true, '["SHOPEE_DIRECT"]', true, CURRENT_TIMESTAMP),
  ('plan_pro_yearly', 'PRO_YEARLY', 'Gói Pro (Hàng năm)', 165000, 1990000, 365, 'YEARLY', 3000, 50000, false, false, true, '["SHOPEE_DIRECT"]', true, CURRENT_TIMESTAMP),
  ('plan_business_399k', 'PREMIUM_399K', 'Gói Business (Hàng tháng)', 399000, 399000, 30, 'MONTHLY', 20000, 500000, false, false, true, '["SHOPEE_DIRECT"]', true, CURRENT_TIMESTAMP),
  ('plan_business_yearly', 'PREMIUM_YEARLY', 'Gói Business (Hàng năm)', 332500, 3990000, 365, 'YEARLY', 20000, 500000, false, false, true, '["SHOPEE_DIRECT"]', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "priceVnd" = EXCLUDED."priceVnd",
  "durationDays" = EXCLUDED."durationDays",
  "billingCycle" = EXCLUDED."billingCycle",
  "maxUsers" = EXCLUDED."maxUsers",
  "maxClicksPerMonth" = EXCLUDED."maxClicksPerMonth",
  "allowCustomDomain" = EXCLUDED."allowCustomDomain",
  "allowApiCredentials" = EXCLUDED."allowApiCredentials",
  "allowZaloBot" = EXCLUDED."allowZaloBot",
  "allowedConnectors" = EXCLUDED."allowedConnectors",
  "active" = EXCLUDED."active",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Tenant"
SET "planId" = 'STARTER_99K'
WHERE "planId" IS NULL
   OR "planId" NOT IN ('TRIAL_14D', 'STARTER_99K', 'STARTER_YEARLY', 'PRO_199K', 'PRO_YEARLY', 'PREMIUM_399K', 'PREMIUM_YEARLY');

UPDATE "SaaSInvoice"
SET "planCode" = 'STARTER_99K'
WHERE "planCode" IS NULL
   OR "planCode" NOT IN ('TRIAL_14D', 'STARTER_99K', 'STARTER_YEARLY', 'PRO_199K', 'PRO_YEARLY', 'PREMIUM_399K', 'PREMIUM_YEARLY');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Tenant" t
    LEFT JOIN "SubscriptionPlan" p ON p."code" = t."planId"
    WHERE p."code" IS NULL
  ) THEN
    RAISE EXCEPTION 'Tenant planId cannot be mapped to SubscriptionPlan.code';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SaaSInvoice" invoice
    LEFT JOIN "SubscriptionPlan" plan ON plan."code" = invoice."planCode"
    WHERE plan."code" IS NULL
  ) THEN
    RAISE EXCEPTION 'SaaSInvoice planCode cannot be mapped to SubscriptionPlan.code';
  END IF;
END
$$;

UPDATE "Tenant" SET "planCode" = "planId" WHERE "planCode" IS NULL;

UPDATE "SaaSInvoice" invoice
SET
  "amountVnd" = invoice."amount"::BIGINT,
  "durationDays" = plan."durationDays",
  "expiresAt" = COALESCE(invoice."expiresAt", invoice."createdAt" + INTERVAL '24 hours'),
  "planSnapshot" = jsonb_build_object(
    'code', plan."code",
    'name', plan."name",
    'priceVnd', plan."priceVnd"::TEXT,
    'durationDays', plan."durationDays",
    'billingCycle', plan."billingCycle"::TEXT
  )
FROM "SubscriptionPlan" plan
WHERE plan."code" = invoice."planCode";

UPDATE "ZaloGroupBinding" SET "active" = false;

CREATE UNIQUE INDEX "ZaloBindingCode_tokenHash_key" ON "ZaloBindingCode"("tokenHash");
CREATE INDEX "ZaloBindingCode_tenantId_expiresAt_idx" ON "ZaloBindingCode"("tenantId", "expiresAt");
CREATE INDEX "TenantConversionImport_tenantId_createdAt_idx" ON "TenantConversionImport"("tenantId", "createdAt");
CREATE INDEX "TenantConversionImport_status_createdAt_idx" ON "TenantConversionImport"("status", "createdAt");
CREATE UNIQUE INDEX "TenantConversionImport_tenantId_fileSha256_key" ON "TenantConversionImport"("tenantId", "fileSha256");
CREATE INDEX "TenantSubscriptionAdjustment_tenantId_createdAt_idx" ON "TenantSubscriptionAdjustment"("tenantId", "createdAt");
CREATE INDEX "TenantSubscriptionAdjustment_actorUserId_createdAt_idx" ON "TenantSubscriptionAdjustment"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "AffiliateClick_userId_clientIdempotencyKey_key" ON "AffiliateClick"("userId", "clientIdempotencyKey");
CREATE UNIQUE INDEX "PayoutTicket_userId_clientIdempotencyKey_key" ON "PayoutTicket"("userId", "clientIdempotencyKey");
CREATE INDEX "Tenant_planCode_idx" ON "Tenant"("planCode");
CREATE UNIQUE INDEX "SaaSInvoice_tenantId_clientIdempotencyKey_key" ON "SaaSInvoice"("tenantId", "clientIdempotencyKey");
CREATE UNIQUE INDEX "ZaloGroupBinding_chatIdHash_key" ON "ZaloGroupBinding"("chatIdHash");

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_planCode_fkey"
  FOREIGN KEY ("planCode") REFERENCES "SubscriptionPlan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZaloBindingCode" ADD CONSTRAINT "ZaloBindingCode_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZaloBindingCode" ADD CONSTRAINT "ZaloBindingCode_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantConversionImport" ADD CONSTRAINT "TenantConversionImport_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantConversionImport" ADD CONSTRAINT "TenantConversionImport_rawEvidenceId_fkey"
  FOREIGN KEY ("rawEvidenceId") REFERENCES "RawEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantSubscriptionAdjustment" ADD CONSTRAINT "TenantSubscriptionAdjustment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantSubscriptionAdjustment" ADD CONSTRAINT "TenantSubscriptionAdjustment_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionPlan"
  ADD CONSTRAINT "SubscriptionPlan_priceVnd_nonnegative"
    CHECK ("priceVnd" IS NULL OR "priceVnd" >= 0),
  ADD CONSTRAINT "SubscriptionPlan_durationDays_positive"
    CHECK ("durationDays" IS NULL OR "durationDays" > 0);

ALTER TABLE "SaaSInvoice"
  ADD CONSTRAINT "SaaSInvoice_amountVnd_positive"
    CHECK ("amountVnd" IS NULL OR "amountVnd" > 0);

ALTER TABLE "TenantConversionImport"
  ADD CONSTRAINT "TenantConversionImport_counts_valid"
    CHECK (
      "totalRows" >= 0 AND
      "acceptedRows" >= 0 AND
      "quarantinedRows" >= 0 AND
      "duplicateRows" >= 0 AND
      "acceptedRows" + "quarantinedRows" + "duplicateRows" <= "totalRows"
    );

CREATE OR REPLACE FUNCTION prevent_tenant_subscription_adjustment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tenant subscription adjustments are append-only';
END;
$$;

CREATE TRIGGER "TenantSubscriptionAdjustment_append_only"
BEFORE UPDATE OR DELETE ON "TenantSubscriptionAdjustment"
FOR EACH ROW EXECUTE FUNCTION prevent_tenant_subscription_adjustment_mutation();

INSERT INTO "FeatureFlag" ("id", "key", "enabled", "createdAt", "updatedAt")
VALUES (
  'core-v1-lazada-kill-switch',
  'connector.lazada.enabled',
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP;

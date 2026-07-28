DO $$
BEGIN
  CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "SaaSInvoiceStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AffiliateClick" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ConnectorConfig" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Conversion" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

CREATE TABLE IF NOT EXISTS "Tenant" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "customDomain" TEXT,
  "logoUrl" TEXT,
  "brandColor" TEXT DEFAULT '#173b31',
  "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
  "isTrial" BOOLEAN NOT NULL DEFAULT true,
  "trialEndsAt" TIMESTAMP(3),
  "planId" TEXT NOT NULL DEFAULT 'TRIAL_14D',
  "planExpiresAt" TIMESTAMP(3) NOT NULL,
  "ownerUserId" TEXT,
  "zaloBotToken" TEXT,
  "zaloOAId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SubscriptionPlan" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceMonthly" INTEGER NOT NULL,
  "maxUsers" INTEGER NOT NULL,
  "maxClicksPerMonth" INTEGER NOT NULL,
  "allowCustomDomain" BOOLEAN NOT NULL DEFAULT false,
  "allowApiCredentials" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SaaSInvoice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orderCode" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "status" "SaaSInvoiceStatus" NOT NULL DEFAULT 'PENDING',
  "paymentLinkId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaaSInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ZaloGroupBinding" (
  "id" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "linkedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ZaloGroupBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_customDomain_key" ON "Tenant"("customDomain");
CREATE INDEX IF NOT EXISTS "Tenant_slug_idx" ON "Tenant"("slug");
CREATE INDEX IF NOT EXISTS "Tenant_customDomain_idx" ON "Tenant"("customDomain");
CREATE INDEX IF NOT EXISTS "Tenant_status_idx" ON "Tenant"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "SaaSInvoice_orderCode_key" ON "SaaSInvoice"("orderCode");
CREATE INDEX IF NOT EXISTS "SaaSInvoice_tenantId_idx" ON "SaaSInvoice"("tenantId");
CREATE INDEX IF NOT EXISTS "SaaSInvoice_orderCode_idx" ON "SaaSInvoice"("orderCode");
CREATE UNIQUE INDEX IF NOT EXISTS "ZaloGroupBinding_chatId_key" ON "ZaloGroupBinding"("chatId");
CREATE INDEX IF NOT EXISTS "ZaloGroupBinding_chatId_idx" ON "ZaloGroupBinding"("chatId");
CREATE INDEX IF NOT EXISTS "ZaloGroupBinding_tenantId_idx" ON "ZaloGroupBinding"("tenantId");
CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX IF NOT EXISTS "AffiliateClick_tenantId_idx" ON "AffiliateClick"("tenantId");
CREATE INDEX IF NOT EXISTS "ConnectorConfig_tenantId_idx" ON "ConnectorConfig"("tenantId");
CREATE INDEX IF NOT EXISTS "Conversion_tenantId_idx" ON "Conversion"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_tenantId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateClick_tenantId_fkey') THEN
    ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConnectorConfig_tenantId_fkey') THEN
    ALTER TABLE "ConnectorConfig" ADD CONSTRAINT "ConnectorConfig_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Conversion_tenantId_fkey') THEN
    ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaaSInvoice_tenantId_fkey') THEN
    ALTER TABLE "SaaSInvoice" ADD CONSTRAINT "SaaSInvoice_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ZaloGroupBinding_tenantId_fkey') THEN
    ALTER TABLE "ZaloGroupBinding" ADD CONSTRAINT "ZaloGroupBinding_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

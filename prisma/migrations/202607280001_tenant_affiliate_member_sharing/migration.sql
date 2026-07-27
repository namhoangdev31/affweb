ALTER TABLE "AffiliateClick"
  ADD COLUMN "productSnapshot" JSONB;

ALTER TABLE "Conversion"
  ADD COLUMN "tenantPaidAt" TIMESTAMP(3),
  ADD COLUMN "withholdingTaxBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "withholdingTaxVnd" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "Tenant"
  ADD COLUMN "memberShareBps" INTEGER,
  ADD COLUMN "shopeeAffiliateId" TEXT;

CREATE UNIQUE INDEX "Tenant_ownerUserId_key" ON "Tenant"("ownerUserId");

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_memberShareBps_range"
  CHECK ("memberShareBps" IS NULL OR "memberShareBps" BETWEEN 100 AND 10000),
  ADD CONSTRAINT "Tenant_shopeeAffiliateId_format"
  CHECK ("shopeeAffiliateId" IS NULL OR "shopeeAffiliateId" ~ '^[0-9]{5,30}$');

ALTER TABLE "Conversion"
  ADD CONSTRAINT "Conversion_withholdingTaxBps_range"
  CHECK ("withholdingTaxBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "Conversion_withholdingTaxVnd_nonnegative"
  CHECK ("withholdingTaxVnd" >= 0),
  ADD CONSTRAINT "Conversion_withholdingTaxVnd_not_above_net"
  CHECK ("withholdingTaxVnd" <= "netCommissionVnd");

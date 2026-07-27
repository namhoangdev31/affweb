import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  AffiliateTargetType,
  ConnectorType,
  EvidenceAuthority,
  IdentityState,
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  PayoutStatus,
  Platform,
  UserStatus
} from "@/generated/prisma/client";
import { encryptSensitiveValue } from "@/lib/crypto";
import { db } from "@/lib/db";
import { isBalancedJournal } from "@/modules/ledger/invariants";

describe("Live Database Seeding & Integration Test for User nguyenhoangnam31082000@gmail.com", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("creates and verifies real database records for nguyenhoangnam31082000@gmail.com", async () => {
    const targetEmail = "nguyenhoangnam31082000@gmail.com";
    const clerkUserId = "user_clerk_nam_31082000";

    // 1. Upsert User with Clerk identity fields
    const user = await db.user.upsert({
      where: { email: targetEmail },
      update: {
        clerkUserId,
        name: "Nguyễn Hoàng Nam",
        status: UserStatus.ACTIVE,
        identityState: IdentityState.ACTIVE
      },
      create: {
        email: targetEmail,
        clerkUserId,
        name: "Nguyễn Hoàng Nam",
        status: UserStatus.ACTIVE,
        identityState: IdentityState.ACTIVE
      }
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe(targetEmail);

    // 2. Tenant KOC Channel (hoangnamkoc)
    const tenant = await db.tenant.upsert({
      where: { slug: "hoangnamkoc" },
      update: {
        name: "Hoàng Nam KOC Store",
        ownerUserId: user.id,
        status: "ACTIVE",
        isTrial: false
      },
      create: {
        slug: "hoangnamkoc",
        name: "Hoàng Nam KOC Store",
        brandColor: "#173b31",
        ownerUserId: user.id,
        status: "ACTIVE",
        isTrial: false,
        planId: "PRO_MONTHLY",
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    // Link user to tenant
    await db.user.update({
      where: { id: user.id },
      data: { tenantId: tenant.id }
    });

    // 3. Merchants setup for Shopee, Lazada, ShopeeFood
    const shopeeMerchant = await db.merchant.upsert({
      where: { slug: "shopee-vn" },
      update: {},
      create: {
        platform: Platform.SHOPEE_MARKETPLACE,
        code: "shopee_vn",
        slug: "shopee-vn",
        name: "Shopee Việt Nam",
        defaultShareBps: 5000
      }
    });

    const lazadaMerchant = await db.merchant.upsert({
      where: { slug: "lazada-vn" },
      update: {},
      create: {
        platform: Platform.LAZADA,
        code: "lazada_vn",
        slug: "lazada-vn",
        name: "Lazada Việt Nam",
        defaultShareBps: 5000
      }
    });

    const shopeeFoodMerchant = await db.merchant.upsert({
      where: { slug: "shopeefood-vn" },
      update: {},
      create: {
        platform: Platform.SHOPEE_FOOD,
        code: "shopeefood_vn",
        slug: "shopeefood-vn",
        name: "ShopeeFood Việt Nam",
        defaultShareBps: 6000
      }
    });

    // 4. Affiliate Accounts
    const shopeeAccount = await db.affiliateAccount.upsert({
      where: {
        connectorType_platform_externalAccountId: {
          connectorType: ConnectorType.SHOPEE_OPEN_API,
          platform: Platform.SHOPEE_MARKETPLACE,
          externalAccountId: "shopee_official_nam"
        }
      },
      update: {},
      create: {
        connectorType: ConnectorType.SHOPEE_OPEN_API,
        platform: Platform.SHOPEE_MARKETPLACE,
        externalAccountId: "shopee_official_nam",
        label: "Shopee Official Account"
      }
    });

    const lazadaAccount = await db.affiliateAccount.upsert({
      where: {
        connectorType_platform_externalAccountId: {
          connectorType: ConnectorType.LAZADA_OPEN_API,
          platform: Platform.LAZADA,
          externalAccountId: "lazada_official_nam"
        }
      },
      update: {},
      create: {
        connectorType: ConnectorType.LAZADA_OPEN_API,
        platform: Platform.LAZADA,
        externalAccountId: "lazada_official_nam",
        label: "Lazada Official Account"
      }
    });

    // 5. Affiliate Clicks
    const clickToken1 = `click-${randomUUID()}`;
    const click1 = await db.affiliateClick.create({
      data: {
        clickToken: clickToken1,
        userId: user.id,
        merchantId: shopeeMerchant.id,
        affiliateAccountId: shopeeAccount.id,
        platform: Platform.SHOPEE_MARKETPLACE,
        targetType: AffiliateTargetType.PRODUCT,
        originUrl: "https://shopee.vn/product/12345/67890",
        subIds: [clickToken1, user.id, tenant.id],
        tenantId: tenant.id,
        clickedAt: new Date()
      }
    });

    // 6. Evidence Data (Strict Schema Compliance)
    const extRef1 = `ORDER-SHP-${Date.now()}`;
    const rawEvidence = await db.rawEvidence.create({
      data: {
        provider: ConnectorType.SHOPEE_OPEN_API,
        kind: "ORDER_ITEM",
        authority: EvidenceAuthority.AUTHORITATIVE,
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        objectKey: `evidence/shopee/2026/07/27/${extRef1}`,
        externalRef: extRef1,
        metadata: { source: "shopee-api", targetEmail }
      }
    });

    // 7. Conversions
    const conversion1 = await db.conversion.create({
      data: {
        userId: user.id,
        clickId: click1.id,
        merchantId: shopeeMerchant.id,
        platform: Platform.SHOPEE_MARKETPLACE,
        sourceAuthority: EvidenceAuthority.AUTHORITATIVE,
        status: "VALIDATED",
        grossCommissionVnd: 120_000n,
        netCommissionVnd: 120_000n,
        cashbackVnd: 60_000n,
        shareBps: 5000,
        purchasedAt: new Date(),
        rawEvidenceId: rawEvidence.id,
        tenantId: tenant.id,
        externalIdentities: {
          create: [
            {
              source: ConnectorType.SHOPEE_OPEN_API,
              affiliateAccountId: shopeeAccount.id,
              externalOrderId: extRef1,
              externalItemKey: "item-101"
            }
          ]
        },
        items: {
          create: [
            {
              externalItemId: "item-101",
              name: "Áo Polo Nam Premium Cotton 100%",
              quantity: 2,
              priceVnd: 350_000n,
              commissionVnd: 120_000n,
              cashbackVnd: 60_000n
            }
          ]
        }
      }
    });

    const extRef2 = `ORDER-LAZ-${Date.now()}`;
    const conversion2 = await db.conversion.create({
      data: {
        userId: user.id,
        merchantId: lazadaMerchant.id,
        platform: Platform.LAZADA,
        sourceAuthority: EvidenceAuthority.PROVISIONAL_AUTHORITATIVE,
        status: "PENDING",
        grossCommissionVnd: 80_000n,
        netCommissionVnd: 80_000n,
        cashbackVnd: 40_000n,
        shareBps: 5000,
        purchasedAt: new Date(),
        rawEvidenceId: rawEvidence.id,
        tenantId: tenant.id,
        externalIdentities: {
          create: [
            {
              source: ConnectorType.LAZADA_OPEN_API,
              affiliateAccountId: lazadaAccount.id,
              externalOrderId: extRef2,
              externalItemKey: "item-202"
            }
          ]
        },
        items: {
          create: [
            {
              externalItemId: "item-202",
              name: "Tai nghe Bluetooth Noisecancel Wireless Pro",
              quantity: 1,
              priceVnd: 650_000n,
              commissionVnd: 80_000n,
              cashbackVnd: 40_000n
            }
          ]
        }
      }
    });

    const extRef3 = `ORDER-SPF-${Date.now()}`;
    const conversion3 = await db.conversion.create({
      data: {
        userId: user.id,
        merchantId: shopeeFoodMerchant.id,
        platform: Platform.SHOPEE_FOOD,
        sourceAuthority: EvidenceAuthority.AUTHORITATIVE,
        status: "VALIDATED",
        grossCommissionVnd: 30_000n,
        netCommissionVnd: 30_000n,
        cashbackVnd: 18_000n,
        shareBps: 6000,
        purchasedAt: new Date(),
        rawEvidenceId: rawEvidence.id,
        tenantId: tenant.id,
        externalIdentities: {
          create: [
            {
              source: ConnectorType.SHOPEE_DIRECT,
              affiliateAccountId: shopeeAccount.id,
              externalOrderId: extRef3,
              externalItemKey: "item-303"
            }
          ]
        },
        items: {
          create: [
            {
              externalItemId: "item-303",
              name: "Trà sữa Phúc Long Ô Long Sữa Chân Châu",
              quantity: 2,
              priceVnd: 65_000n,
              commissionVnd: 30_000n,
              cashbackVnd: 18_000n
            }
          ]
        }
      }
    });

    expect(conversion1.id).toBeDefined();
    expect(conversion2.id).toBeDefined();
    expect(conversion3.id).toBeDefined();

    // 8. Wallet Projection
    await db.walletProjection.upsert({
      where: { userId: user.id },
      update: {
        availableVnd: 250_000n,
        pendingVnd: 40_000n,
        paidVnd: 150_000n
      },
      create: {
        userId: user.id,
        availableVnd: 250_000n,
        pendingVnd: 40_000n,
        paidVnd: 150_000n
      }
    });

    // 9. Ledger Accounts & Transaction
    const assetAccount = await db.ledgerAccount.upsert({
      where: { code: "asset:provider-receivable" },
      update: {},
      create: {
        code: "asset:provider-receivable",
        name: "Phải thu đối tác Sàn",
        kind: LedgerAccountKind.ASSET
      }
    });

    const userLiabilityAccount = await db.ledgerAccount.upsert({
      where: { code: `liability:user:${user.id}:available` },
      update: {},
      create: {
        code: `liability:user:${user.id}:available`,
        name: `Ví khả dụng - ${user.name}`,
        kind: LedgerAccountKind.LIABILITY,
        userId: user.id
      }
    });

    const transaction = await db.ledgerTransaction.create({
      data: {
        type: LedgerTransactionType.COMMISSION_VALIDATED,
        idempotencyKey: `idem-${randomUUID()}`,
        description: `Ghi nhận hoa hồng đơn Shopee & ShopeeFood cho ${targetEmail}`,
        entries: {
          create: [
            {
              accountId: assetAccount.id,
              direction: LedgerDirection.DEBIT,
              amountVnd: 150_000n
            },
            {
              accountId: userLiabilityAccount.id,
              direction: LedgerDirection.CREDIT,
              amountVnd: 78_000n
            }
          ]
        }
      }
    });

    expect(transaction.id).toBeDefined();

    // 10. Bank Beneficiary (AES-256-GCM Encrypted)
    process.env.BANK_DATA_ENCRYPTION_KEY_V1 = "VKHz4X96+S3csGtI4OxpJwYVWOEHOForPthW4MnV8/E=";
    const encryptedBankAcc = encryptSensitiveValue("190365498888");
    const encryptedName = encryptSensitiveValue("NGUYEN HOANG NAM");

    const beneficiary = await db.bankBeneficiary.create({
      data: {
        userId: user.id,
        bankBin: "970407", // Techcombank
        accountNumberCipher: encryptedBankAcc,
        accountNameCipher: encryptedName,
        accountLast4: "8888",
        encryptionKeyVersion: 1,
        status: "VERIFIED",
        active: true
      }
    });

    expect(beneficiary.id).toBeDefined();

    // 11. Payout Ticket
    const payoutTicket = await db.payoutTicket.create({
      data: {
        reference: `PAY-${Date.now()}`,
        userId: user.id,
        amountVnd: 150_000n,
        status: PayoutStatus.REVIEWED,
        beneficiaryId: beneficiary.id
      }
    });

    expect(payoutTicket.id).toBeDefined();

    // 12. SaaS Subscription Invoice for Tenant
    const saasInvoice = await db.saaSInvoice.create({
      data: {
        tenantId: tenant.id,
        orderCode: Math.floor(100000 + Math.random() * 900000),
        amount: 299000,
        description: "Gói KOC PRO 1 Tháng - Hoàng Nam KOC",
        planCode: "PRO_MONTHLY",
        status: "PAID",
        paidAt: new Date()
      }
    });

    expect(saasInvoice.id).toBeDefined();
  });
});

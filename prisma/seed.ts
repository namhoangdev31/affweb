import { PrismaPg } from "@prisma/adapter-pg";
import {
  ConnectorMode,
  ConnectorType,
  PrismaClient,
  Platform
} from "../src/generated/prisma/client";

const connectionString =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/affweb";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});

const merchants = [
  {
    platform: Platform.SHOPEE_MARKETPLACE,
    code: "shopee-vn",
    slug: "shopee",
    name: "Shopee",
    description: "Hoàn tiền cho sản phẩm và cửa hàng đủ điều kiện trên Shopee."
  },
  {
    platform: Platform.SHOPEE_FOOD,
    code: "shopee-food-vn",
    slug: "shopee-food",
    name: "ShopeeFood",
    description: "Ưu đãi nhà hàng và món ăn thuộc chương trình ShopeeFood Affiliate."
  },
  {
    platform: Platform.LAZADA,
    code: "lazada-vn",
    slug: "lazada",
    name: "Lazada",
    description: "Connector đã sẵn sàng và sẽ mở khi LiteApp token được cấp."
  },
  {
    platform: Platform.ACCESSTRADE,
    code: "accesstrade-vn",
    slug: "accesstrade",
    name: "AccessTrade",
    description: "Tổng hợp chiến dịch affiliate từ AccessTrade."
  }
] as const;

for (const merchant of merchants) {
  await prisma.merchant.upsert({
    where: {
      platform_code: {
        platform: merchant.platform,
        code: merchant.code
      }
    },
    update: merchant,
    create: merchant
  });
}

const flags = [
  ["registration.invite_only", true, "Chỉ người dùng có lời mời được đăng ký."],
  ["connector.shopee.enabled", true, "Shopee Marketplace link và sync."],
  ["connector.shopee_food.enabled", true, "ShopeeFood link; cashback vẫn có flag riêng."],
  ["connector.accesstrade.enabled", false, "Bật sau credential preflight AccessTrade."],
  ["connector.lazada.enabled", false, "Bật sau credential preflight Lazada."],
  ["provider.credentials.enabled", false, "Kill switch cấu hình provider credentials."],
  ["shopee.orders_import.enabled", false, "Kill switch Shopee Orders CSV import."],
  [
    "shopee.reconciliation_import.enabled",
    false,
    "Giữ tắt đến khi có fixture chi tiết hóa đơn đối soát."
  ],
  ["cashback.release.enabled", false, "Kill switch phát hành cashback qua settlement."],
  ["payout.enabled", false, "Kill switch gửi payout thật."],
  ["tenant.finance.enabled", false, "Kill switch tenant financial ledger."],
  ["tenant.topup.enabled", false, "Kill switch tenant treasury funding."],
  ["tenant.payout_request.enabled", false, "Kill switch tenant payout request."],
  ["tenant.payout_approval.enabled", false, "Kill switch tenant payout approval."],
  ["tenant.treasury_withdrawal.enabled", false, "Kill switch treasury withdrawal."],
  ["tenant.manual_payout.enabled", false, "Kill switch manual payout workflow."],
  ["tenant.auto_payout.enabled", false, "Kill switch internal PayOS execution."],
  ["tenant.auto_reconciliation.enabled", false, "Kill switch payout reconciliation."],
  ["qstash.recovery.enabled", false, "Kill switch QStash finance recovery."],
  ["tenant.zalo_wallet.enabled", false, "Kill switch Zalo wallet lookup."],
  ["tenant.zalo_payout.enabled", false, "Kill switch Zalo payout confirmation."],
  ["connector.shopee_food_cashback", false, "Chỉ bật sau khi SubID round-trip đạt nghiệm thu."]
] as const;

for (const [key, enabled, description] of flags) {
  await prisma.featureFlag.upsert({
    where: { key },
    update: { enabled, description },
    create: { key, enabled, description }
  });
}

await prisma.featureFlag.upsert({
  where: { key: "payout.daily_budget_vnd" },
  update: {
    enabled: true,
    description: "Ngân sách payout tối đa toàn hệ thống mỗi ngày theo giờ Việt Nam."
  },
  create: {
    key: "payout.daily_budget_vnd",
    enabled: true,
    value: { amountVnd: "5000000" },
    description: "Ngân sách payout tối đa toàn hệ thống mỗi ngày theo giờ Việt Nam."
  }
});

const accounts = [
  {
    connectorType: ConnectorType.SHOPEE_DIRECT,
    platform: Platform.SHOPEE_MARKETPLACE,
    externalAccountId: process.env.SHOPEE_AFFILIATE_ID ?? "pending-shopee-direct",
    label: "Shopee Direct",
    enabled: true,
    mode: ConnectorMode.ACTIVE
  },
  {
    connectorType: ConnectorType.SHOPEE_OPEN_API,
    platform: Platform.SHOPEE_MARKETPLACE,
    externalAccountId: process.env.SHOPEE_APP_ID ?? "pending-shopee-open-api",
    label: "Shopee Open API",
    enabled: process.env.SHOPEE_OPEN_API_ENABLED === "true",
    mode:
      process.env.SHOPEE_OPEN_API_ENABLED === "true" ? ConnectorMode.ACTIVE : ConnectorMode.DISABLED
  },
  {
    connectorType: ConnectorType.ADDLIVETAG_ACCOUNT,
    platform: Platform.SHOPEE_MARKETPLACE,
    externalAccountId: process.env.ADDLIVETAG_ACCOUNT_ID ?? "pending-addlivetag-shopee",
    label: "AddLiveTag Shopee",
    enabled: process.env.ADDLIVETAG_ENABLED === "true",
    mode: process.env.ADDLIVETAG_ENABLED === "true" ? ConnectorMode.ACTIVE : ConnectorMode.DISABLED
  },
  {
    connectorType: ConnectorType.ADDLIVETAG_ACCOUNT,
    platform: Platform.SHOPEE_FOOD,
    externalAccountId: `${process.env.ADDLIVETAG_ACCOUNT_ID ?? "pending-addlivetag"}-food`,
    label: "AddLiveTag ShopeeFood",
    enabled: process.env.ADDLIVETAG_ENABLED === "true",
    mode: process.env.ADDLIVETAG_ENABLED === "true" ? ConnectorMode.ACTIVE : ConnectorMode.DISABLED
  },
  {
    connectorType: ConnectorType.ACCESSTRADE_API,
    platform: Platform.ACCESSTRADE,
    externalAccountId: process.env.ACCESSTRADE_PUBLISHER_ID ?? "pending-accesstrade",
    label: "AccessTrade",
    enabled: process.env.ACCESSTRADE_ENABLED === "true",
    mode: process.env.ACCESSTRADE_ENABLED === "true" ? ConnectorMode.ACTIVE : ConnectorMode.DISABLED
  },
  {
    connectorType: ConnectorType.LAZADA_OPEN_API,
    platform: Platform.LAZADA,
    externalAccountId: process.env.LAZADA_AFFILIATE_ID ?? "pending-lazada",
    label: "Lazada Affiliate",
    enabled: process.env.LAZADA_MODE === "active" || process.env.LAZADA_MODE === "shadow",
    mode:
      process.env.LAZADA_MODE === "active"
        ? ConnectorMode.ACTIVE
        : process.env.LAZADA_MODE === "shadow"
          ? ConnectorMode.SHADOW
          : ConnectorMode.CREDENTIAL_READY
  }
] as const;

for (const accountInput of accounts) {
  const account = await prisma.affiliateAccount.upsert({
    where: {
      connectorType_platform_externalAccountId: {
        connectorType: accountInput.connectorType,
        platform: accountInput.platform,
        externalAccountId: accountInput.externalAccountId
      }
    },
    create: {
      connectorType: accountInput.connectorType,
      platform: accountInput.platform,
      externalAccountId: accountInput.externalAccountId,
      label: accountInput.label,
      enabled: accountInput.enabled
    },
    update: { label: accountInput.label, enabled: accountInput.enabled }
  });
  await prisma.connectorConfig.upsert({
    where: {
      connectorType_platform_affiliateAccountId: {
        connectorType: accountInput.connectorType,
        platform: accountInput.platform,
        affiliateAccountId: account.id
      }
    },
    create: {
      connectorType: accountInput.connectorType,
      platform: accountInput.platform,
      affiliateAccountId: account.id,
      enabled: accountInput.enabled,
      mode: accountInput.mode
    },
    update: { enabled: accountInput.enabled, mode: accountInput.mode }
  });
}

await prisma.$disconnect();

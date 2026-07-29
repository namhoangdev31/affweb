export interface TenantPlanDetails {
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number;
  maxClicksPerMonth: number;
  allowCustomDomain: boolean;
  allowApiCredentials: boolean;
  allowZaloBot: boolean;
  allowedConnectors: string[];
}

export const PLAN_PRESETS: Record<string, TenantPlanDetails> = {
  TRIAL_14D: {
    code: "TRIAL_14D",
    name: "Dùng thử 14 Ngày",
    priceMonthly: 0,
    priceYearly: 0,
    maxUsers: 50,
    maxClicksPerMonth: 2147483647,
    allowCustomDomain: false,
    allowApiCredentials: false,
    allowZaloBot: true,
    allowedConnectors: ["SHOPEE_DIRECT", "LAZADA_OPEN_API", "ACCESSTRADE_API"]
  },
  STARTER_99K: {
    code: "STARTER_99K",
    name: "Gói Starter (Hàng tháng)",
    priceMonthly: 99000,
    priceYearly: 990000,
    maxUsers: 100,
    maxClicksPerMonth: 2147483647,
    allowCustomDomain: false,
    allowApiCredentials: false,
    allowZaloBot: true,
    allowedConnectors: ["SHOPEE_DIRECT", "LAZADA_OPEN_API", "ACCESSTRADE_API"]
  },
  STARTER_YEARLY: {
    code: "STARTER_YEARLY",
    name: "Gói Starter (Hàng năm - Tiết kiệm 2 tháng)",
    priceMonthly: 82500,
    priceYearly: 990000,
    maxUsers: 100,
    maxClicksPerMonth: 2147483647,
    allowCustomDomain: false,
    allowApiCredentials: false,
    allowZaloBot: true,
    allowedConnectors: ["SHOPEE_DIRECT", "LAZADA_OPEN_API", "ACCESSTRADE_API"]
  },
  PRO_199K: {
    code: "PRO_199K",
    name: "Gói Pro (Hàng tháng)",
    priceMonthly: 199000,
    priceYearly: 1990000,
    maxUsers: 1000,
    maxClicksPerMonth: 2147483647,
    allowCustomDomain: false,
    allowApiCredentials: false,
    allowZaloBot: true,
    allowedConnectors: ["SHOPEE_DIRECT", "LAZADA_OPEN_API", "ACCESSTRADE_API"]
  },
  PRO_YEARLY: {
    code: "PRO_YEARLY",
    name: "Gói Pro (Hàng năm - Tiết kiệm 2 tháng)",
    priceMonthly: 165000,
    priceYearly: 1990000,
    maxUsers: 1000,
    maxClicksPerMonth: 2147483647,
    allowCustomDomain: false,
    allowApiCredentials: false,
    allowZaloBot: true,
    allowedConnectors: ["SHOPEE_DIRECT", "LAZADA_OPEN_API", "ACCESSTRADE_API"]
  },
  PREMIUM_399K: {
    code: "PREMIUM_399K",
    name: "Gói Business (Hàng tháng)",
    priceMonthly: 399000,
    priceYearly: 3990000,
    maxUsers: 10000,
    maxClicksPerMonth: 2147483647,
    allowCustomDomain: false,
    allowApiCredentials: true,
    allowZaloBot: true,
    allowedConnectors: ["SHOPEE_DIRECT", "LAZADA_OPEN_API", "ACCESSTRADE_API"]
  },
  PREMIUM_YEARLY: {
    code: "PREMIUM_YEARLY",
    name: "Gói Business (Hàng năm - Tiết kiệm 2 tháng)",
    priceMonthly: 332500,
    priceYearly: 3990000,
    maxUsers: 10000,
    maxClicksPerMonth: 2147483647,
    allowCustomDomain: false,
    allowApiCredentials: true,
    allowZaloBot: true,
    allowedConnectors: ["SHOPEE_DIRECT", "LAZADA_OPEN_API", "ACCESSTRADE_API"]
  }
};

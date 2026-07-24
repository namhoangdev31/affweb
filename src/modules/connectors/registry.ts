import { Platform } from "@/generated/prisma/client";
import { AccessTradeConnector } from "@/modules/connectors/accesstrade";
import { LazadaConnector } from "@/modules/connectors/lazada";
import { ShopeeDirectConnector, ShopeeFoodConnector } from "@/modules/connectors/shopee";
import type { AffiliateConnector } from "@/modules/connectors/types";

const connectors: Record<Platform, AffiliateConnector> = {
  [Platform.SHOPEE_MARKETPLACE]: new ShopeeDirectConnector(),
  [Platform.SHOPEE_FOOD]: new ShopeeFoodConnector(),
  [Platform.LAZADA]: new LazadaConnector(),
  [Platform.ACCESSTRADE]: new AccessTradeConnector()
};

export function connectorFor(platform: Platform): AffiliateConnector {
  return connectors[platform];
}

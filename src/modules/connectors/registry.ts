import { Platform } from "@/generated/prisma/client";
import { AccessTradeConnector } from "@/modules/connectors/accesstrade";
import { LazadaConnector } from "@/modules/connectors/lazada";
import { ShopeeDirectConnector, ShopeeFoodConnector } from "@/modules/connectors/shopee";
import type { AffiliateConnector } from "@/modules/connectors/types";
import type { ProviderCredentialPayload } from "@/modules/connectors/provider-credentials";

const connectors: Record<Platform, AffiliateConnector> = {
  [Platform.SHOPEE_MARKETPLACE]: new ShopeeDirectConnector(),
  [Platform.SHOPEE_FOOD]: new ShopeeFoodConnector(),
  [Platform.LAZADA]: new LazadaConnector(),
  [Platform.ACCESSTRADE]: new AccessTradeConnector()
};

export function connectorFor(
  platform: Platform,
  credential?: ProviderCredentialPayload
): AffiliateConnector {
  if (platform === Platform.ACCESSTRADE) {
    if (credential && credential.provider !== "ACCESSTRADE_API") {
      throw new TypeError("AccessTrade credential does not match platform.");
    }
    return new AccessTradeConnector(credential);
  }
  if (platform === Platform.LAZADA) {
    if (credential && credential.provider !== "LAZADA_OPEN_API") {
      throw new TypeError("Lazada credential does not match platform.");
    }
    return new LazadaConnector(credential);
  }
  return connectors[platform];
}

import type {
  AffiliateConnector,
  NormalizedClick,
  NormalizedConversion,
  NormalizedValidation,
  OfferPage,
  OfferQuery,
  SyncWindow
} from "@/modules/connectors/types";

export abstract class ConnectorBase implements Omit<
  AffiliateConnector,
  "platform" | "healthCheck" | "normalizeUrl" | "createTrackingLink"
> {
  async listOffers(_input: OfferQuery): Promise<OfferPage> {
    void _input;
    return { offers: [] };
  }

  async *syncClicks(_window: SyncWindow): AsyncIterable<NormalizedClick> {
    void _window;
    return;
  }

  async *syncConversions(_window: SyncWindow): AsyncIterable<NormalizedConversion> {
    void _window;
    return;
  }

  async *syncValidations(_window: SyncWindow): AsyncIterable<NormalizedValidation> {
    void _window;
    return;
  }
}

import type { AffiliateTargetType, Platform } from "@/generated/prisma/client";

export type ConnectorHealth = {
  ok: boolean;
  checkedAt: Date;
  latencyMs: number;
  message?: string | undefined;
};

export type NormalizedAffiliateTarget = {
  platform: Platform;
  targetType: AffiliateTargetType;
  canonicalUrl: string;
  externalId?: string | undefined;
};

export type TrackingLinkInput = {
  target: NormalizedAffiliateTarget;
  clickToken: string;
  subIds: string[];
  campaignExternalId?: string | undefined;
  affiliateId?: string | undefined;
};

export type TrackingLinkResult = {
  url: string;
  providerClickId?: string | undefined;
};

export type OfferQuery = {
  keyword?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};

export type Offer = {
  externalId: string;
  title: string;
  originUrl: string;
  imageUrl?: string | undefined;
  priceVnd?: bigint | undefined;
  originalPriceVnd?: bigint | undefined;
  commissionBps?: number | undefined;
  payload: unknown;
};

export type OfferPage = {
  offers: Offer[];
  nextCursor?: string | undefined;
};

export type SyncWindow = {
  start: Date;
  end: Date;
  cursor?: string | undefined;
};

export type NormalizedClick = {
  externalClickId: string;
  clickToken?: string | undefined;
  clickedAt: Date;
  payload: unknown;
};

export type NormalizedConversionItem = {
  externalItemId: string;
  name?: string | undefined;
  quantity: number;
  priceVnd?: bigint | undefined;
  commissionVnd: bigint;
  payload: unknown;
};

export type NormalizedConversion = {
  externalOrderId: string;
  externalItemKey: string;
  clickToken?: string | undefined;
  purchasedAt: Date;
  deliveredAt?: Date | undefined;
  orderStatusUpdatedAt?: Date | undefined;
  rawOrderStatus?: string | undefined;
  grossCommissionVnd: bigint;
  netCommissionVnd: bigint;
  status:
    | "pending"
    | "delivered"
    | "validated"
    | "rejected"
    | "returned"
    | "cancelled"
    | "review_required";
  items: NormalizedConversionItem[];
  payload: unknown;
};

export type NormalizedValidation = {
  externalOrderId: string;
  externalItemKey: string;
  status: "validated" | "rejected" | "review_required";
  commissionVnd: bigint;
  validatedAt: Date;
  rawOrderStatus?: string | undefined;
  payload: unknown;
};

export interface AffiliateConnector {
  readonly platform: Platform;
  healthCheck(): Promise<ConnectorHealth>;
  normalizeUrl(input: string): Promise<NormalizedAffiliateTarget>;
  createTrackingLink(input: TrackingLinkInput): Promise<TrackingLinkResult>;
  listOffers(input: OfferQuery): Promise<OfferPage>;
  syncClicks(window: SyncWindow): AsyncIterable<NormalizedClick>;
  syncConversions(window: SyncWindow): AsyncIterable<NormalizedConversion>;
  syncValidations(window: SyncWindow): AsyncIterable<NormalizedValidation>;
}

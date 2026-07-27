import { Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { ConnectorBase } from "@/modules/connectors/base";
import type {
  ConnectorHealth,
  NormalizedAffiliateTarget,
  TrackingLinkInput,
  TrackingLinkResult
} from "@/modules/connectors/types";
import { inferTargetType, parseAllowedUrl } from "@/modules/connectors/url-policy";

export class ShopeeDirectConnector extends ConnectorBase {
  readonly platform = Platform.SHOPEE_MARKETPLACE;

  async healthCheck(): Promise<ConnectorHealth> {
    const startedAt = Date.now();
    const configured = Boolean(loadServerEnv().SHOPEE_AFFILIATE_ID);
    return {
      ok: configured,
      checkedAt: new Date(),
      latencyMs: Date.now() - startedAt,
      message: configured ? "Shopee direct link sẵn sàng." : "Thiếu SHOPEE_AFFILIATE_ID."
    };
  }

  async normalizeUrl(input: string): Promise<NormalizedAffiliateTarget> {
    const url = parseAllowedUrl(input, this.platform);
    return {
      platform: this.platform,
      targetType: inferTargetType(url, this.platform),
      canonicalUrl: url.toString()
    };
  }

  async createTrackingLink(input: TrackingLinkInput): Promise<TrackingLinkResult> {
    const affiliateId = input.affiliateId ?? loadServerEnv().SHOPEE_AFFILIATE_ID;
    if (!affiliateId) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "Shopee connector chưa được cấu hình.", 503);
    }
    if (input.subIds.length > 5) {
      throw new AppError("VALIDATION_ERROR", "Shopee chỉ hỗ trợ tối đa 5 SubID.", 400);
    }
    const target = parseAllowedUrl(input.target.canonicalUrl, this.platform);
    const redirect = new URL("https://s.shopee.vn/an_redir");
    redirect.searchParams.set("origin_link", target.toString());
    redirect.searchParams.set("affiliate_id", affiliateId);

    // Aggregate sub_id for Shopee Click Report table display ({clickToken}-{userId}-{tenantId}-hoantien)
    const combinedSubId = input.subIds.filter(Boolean).join("-");
    redirect.searchParams.set("sub_id", combinedSubId);

    // Set sub_id1, sub_id2, sub_id3, sub_id4
    input.subIds.forEach((subId, index) => {
      if (subId) {
        redirect.searchParams.set(`sub_id${index + 1}`, subId);
      }
    });

    return { url: redirect.toString() };
  }
}

export class ShopeeFoodConnector extends ConnectorBase {
  readonly platform = Platform.SHOPEE_FOOD;

  async healthCheck(): Promise<ConnectorHealth> {
    const configured =
      loadServerEnv().ADDLIVETAG_ENABLED && Boolean(loadServerEnv().ADDLIVETAG_API_KEY);
    return {
      ok: configured,
      checkedAt: new Date(),
      latencyMs: 0,
      message: configured
        ? "ShopeeFood qua AddLiveTag sẵn sàng."
        : "ShopeeFood link-only; cashback đang đóng."
    };
  }

  async normalizeUrl(input: string): Promise<NormalizedAffiliateTarget> {
    const url = parseAllowedUrl(input, this.platform);
    return {
      platform: this.platform,
      targetType: inferTargetType(url, this.platform),
      canonicalUrl: url.toString()
    };
  }

  async createTrackingLink(input: TrackingLinkInput): Promise<TrackingLinkResult> {
    const affiliateId = input.affiliateId ?? loadServerEnv().SHOPEE_AFFILIATE_ID;
    if (!affiliateId) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "ShopeeFood connector chưa được cấu hình.", 503);
    }
    const target = parseAllowedUrl(input.target.canonicalUrl, this.platform);
    const redirect = new URL("https://s.shopee.vn/an_redir");
    redirect.searchParams.set("origin_link", target.toString());
    redirect.searchParams.set("affiliate_id", affiliateId);
    redirect.searchParams.set("source", "food");

    const combinedSubId = input.subIds.filter(Boolean).join("-");
    redirect.searchParams.set("sub_id", combinedSubId);

    input.subIds.slice(0, 5).forEach((subId, index) => {
      if (subId) {
        redirect.searchParams.set(`sub_id${index + 1}`, subId);
      }
    });

    return { url: redirect.toString() };
  }
}

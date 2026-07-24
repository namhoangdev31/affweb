import { z } from "zod";
import { Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { ConnectorBase } from "@/modules/connectors/base";
import type {
  ConnectorHealth,
  NormalizedAffiliateTarget,
  NormalizedConversion,
  OfferPage,
  OfferQuery,
  SyncWindow,
  TrackingLinkInput,
  TrackingLinkResult
} from "@/modules/connectors/types";

const rowSchema = z
  .object({
    transaction_id: z.coerce.string(),
    conversion_id: z.coerce.string().optional(),
    merchant: z.string(),
    transaction_time: z.string(),
    commission: z.coerce.number(),
    status: z.coerce.number(),
    product_id: z.coerce.string().optional(),
    product_name: z.string().optional(),
    product_price: z.coerce.number().optional(),
    product_quantity: z.coerce.number().int().positive().default(1),
    sub1: z.string().optional(),
    _utm_source: z.string().optional()
  })
  .passthrough();

const transactionsSchema = z.object({
  total: z.coerce.number().int().nonnegative().default(0),
  data: z.array(rowSchema)
});

function extractAffiliateUrl(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.startsWith("https://")) return payload;
  if (Array.isArray(payload)) {
    for (const value of payload) {
      const match = extractAffiliateUrl(value);
      if (match) return match;
    }
  }
  if (payload && typeof payload === "object") {
    for (const [key, value] of Object.entries(payload)) {
      if (
        ["short_link", "short_url", "aff_short_url", "aff_url", "url"].includes(key) &&
        typeof value === "string" &&
        value.startsWith("https://")
      ) {
        return value;
      }
    }
    for (const value of Object.values(payload)) {
      const match = extractAffiliateUrl(value);
      if (match) return match;
    }
  }
  return undefined;
}

export class AccessTradeConnector extends ConnectorBase {
  readonly platform = Platform.ACCESSTRADE;

  private async request(
    path: string,
    options?: { query?: Record<string, string>; body?: Record<string, unknown> }
  ): Promise<unknown> {
    const env = loadServerEnv();
    if (!env.ACCESSTRADE_API_KEY) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "AccessTrade chưa được cấu hình.", 503);
    }
    const url = new URL(path, env.ACCESSTRADE_API_BASE_URL);
    Object.entries(options?.query ?? {}).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    );
    const response = await fetch(url, {
      method: options?.body ? "POST" : "GET",
      headers: {
        Authorization: `Token ${env.ACCESSTRADE_API_KEY}`,
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {})
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        `AccessTrade trả về HTTP ${response.status}.`,
        response.status === 401 || response.status === 429 ? 503 : 502
      );
    }
    return response.json();
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const startedAt = Date.now();
    try {
      await this.request("/v1/campaigns", { query: { limit: "1" } });
      return { ok: true, checkedAt: new Date(), latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        ok: false,
        checkedAt: new Date(),
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "AccessTrade health check failed."
      };
    }
  }

  async normalizeUrl(input: string): Promise<NormalizedAffiliateTarget> {
    const url = new URL(input);
    if (url.protocol !== "https:") {
      throw new AppError("VALIDATION_ERROR", "AccessTrade target phải dùng HTTPS.", 400);
    }
    return { platform: this.platform, targetType: "OFFER", canonicalUrl: url.toString() };
  }

  async createTrackingLink(input: TrackingLinkInput): Promise<TrackingLinkResult> {
    if (!input.campaignExternalId) {
      throw new AppError("VALIDATION_ERROR", "AccessTrade campaign ID là bắt buộc.", 400);
    }
    const result = await this.request("/v1/product_link/create", {
      body: {
        campaign_id: input.campaignExternalId,
        urls: [input.target.canonicalUrl],
        sub1: input.clickToken
      }
    });
    const url = extractAffiliateUrl(result);
    if (!url) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "AccessTrade không trả về tracking URL.", 502);
    }
    return { url };
  }

  async listOffers(input: OfferQuery): Promise<OfferPage> {
    const page = Math.max(1, Number.parseInt(input.cursor ?? "1", 10) || 1);
    const limit = Math.min(input.limit ?? 50, 100);
    const payload = z
      .object({
        data: z
          .array(
            z
              .object({
                id: z.coerce.string(),
                name: z.string(),
                link: z.url(),
                prod_link: z.url().optional(),
                image: z.url().optional()
              })
              .passthrough()
          )
          .default([]),
        total: z.coerce.number().int().nonnegative().optional(),
        success: z.boolean().optional()
      })
      .passthrough()
      .parse(
        await this.request("/v1/offers_informations/coupon", {
          query: {
            page: String(page),
            limit: String(limit),
            ...(input.keyword ? { keyword: input.keyword } : {})
          }
        })
      );
    return {
      offers: payload.data.map((row) => ({
        externalId: row.id,
        title: row.name,
        originUrl: row.prod_link ?? row.link,
        imageUrl: row.image,
        payload: row
      })),
      ...((payload.total ?? 0) > page * limit ? { nextCursor: String(page + 1) } : {})
    };
  }

  async *syncConversions(window: SyncWindow): AsyncIterable<NormalizedConversion> {
    const limit = 100;
    let page = window.cursor ? Math.max(1, Number.parseInt(window.cursor, 10) || 1) : 1;
    let received = 0;
    let total = 0;
    do {
      const payload = await this.request("/v1/transactions", {
        query: {
          since: window.start.toISOString(),
          until: window.end.toISOString(),
          update_time_start: window.start.toISOString(),
          update_time_end: window.end.toISOString(),
          page: String(page),
          limit: String(limit)
        }
      });
      const parsed = transactionsSchema.parse(payload);
      total = parsed.total;
      received += parsed.data.length;
      for (const row of parsed.data) {
        const commission = BigInt(Math.trunc(row.commission));
        const externalItemKey = row.product_id ?? row.conversion_id ?? "order";
        yield {
          externalOrderId: row.transaction_id,
          externalItemKey,
          clickToken: row.sub1 ?? row._utm_source,
          purchasedAt: new Date(row.transaction_time),
          grossCommissionVnd: commission,
          netCommissionVnd: commission,
          status: row.status === 1 ? "validated" : row.status === 2 ? "rejected" : "pending",
          items: [
            {
              externalItemId: externalItemKey,
              name: row.product_name,
              quantity: row.product_quantity,
              ...(row.product_price === undefined
                ? {}
                : { priceVnd: BigInt(Math.trunc(row.product_price)) }),
              commissionVnd: commission,
              payload: row
            }
          ],
          payload: row
        };
      }
      if (parsed.data.length === 0) break;
      page += 1;
    } while (received < total);
  }
}

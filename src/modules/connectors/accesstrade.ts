import { z } from "zod";
import { Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { parseVndAmount } from "@/lib/money";
import { ConnectorBase } from "@/modules/connectors/base";
import type { ProviderCredentialPayload } from "@/modules/connectors/provider-credentials";
import { requestProviderJson } from "@/modules/connectors/provider-http";
import type {
  ConnectorHealth,
  NormalizedAffiliateTarget,
  NormalizedConversion,
  NormalizedValidation,
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
    commission: z.string(),
    status: z.coerce.number(),
    product_id: z.coerce.string().optional(),
    product_name: z.string().optional(),
    product_price: z.string().optional(),
    product_quantity: z.coerce.number().int().positive().default(1),
    sub1: z.string().optional(),
    _utm_source: z.string().optional(),
    update_time: z.string().optional(),
    _extra: z
      .object({
        parameters: z
          .object({
            sub1: z.string().optional(),
            utm_source: z.string().optional()
          })
          .passthrough()
          .optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const transactionsSchema = z.object({
  total: z.coerce.number().int().nonnegative().default(0),
  data: z.array(rowSchema)
});

const orderSummarySchema = z
  .object({
    order_id: z.coerce.string(),
    merchant: z.string(),
    order_pending: z.coerce.number().int().nonnegative(),
    order_reject: z.coerce.number().int().nonnegative(),
    order_approved: z.coerce.number().int().nonnegative(),
    pub_commission: z.string(),
    sales_time: z.string(),
    update_time: z.string()
  })
  .passthrough();

const orderProductSchema = z
  .object({
    _id: z.coerce.string(),
    commission: z.object({
      approved: z.string(),
      pending: z.string(),
      reject: z.string()
    })
  })
  .passthrough();

const orderDetailSchema = z
  .object({
    product_id: z.coerce.string(),
    pub_commission: z.string(),
    status: z.coerce.number().int(),
    confirmed_time: z.string().nullish()
  })
  .passthrough();

const pagedOrderSchema = z.object({
  total: z.coerce.number().int().nonnegative(),
  data: z.array(orderSummarySchema)
});

const pagedProductSchema = z.object({
  total: z.coerce.number().int().nonnegative(),
  data: z.array(orderProductSchema)
});

const pagedDetailSchema = z.object({
  total: z.coerce.number().int().nonnegative(),
  data: z.array(orderDetailSchema)
});

const trackingLinkResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    success_link: z.array(
      z.object({
        aff_link: z.url(),
        short_link: z.url().nullable().optional(),
        url_origin: z.url()
      })
    ),
    error_link: z.array(z.unknown()).default([]),
    suspend_url: z.array(z.unknown()).default([])
  })
});

function safeAccessTradeTrackingUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const allowed = ["accesstrade.vn", "accesstrade.me", "isclix.com"].some(
    (root) => host === root || host.endsWith(`.${root}`)
  );
  if (url.protocol !== "https:" || url.username || url.password || !allowed) {
    throw new AppError(
      "CONNECTOR_UNAVAILABLE",
      "AccessTrade trả về tracking URL không an toàn.",
      502
    );
  }
  return url.toString();
}

type AccessTradeCredential = Extract<ProviderCredentialPayload, { provider: "ACCESSTRADE_API" }>;

export function accessTradeOrderStatus(
  status: number
): "pending" | "validated" | "rejected" | "review_required" {
  if (status === 0) return "pending";
  if (status === 1) return "validated";
  if (status === 2) return "rejected";
  return "review_required";
}

export function parseAccessTradeDate(value: string): Date {
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value}+07:00`
    : value;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "AccessTrade trả về ngày giờ không hợp lệ.", 503);
  }
  return parsed;
}

export class AccessTradeConnector extends ConnectorBase {
  readonly platform = Platform.ACCESSTRADE;
  private nextRequestAt = 0;

  constructor(private readonly credential?: AccessTradeCredential) {
    super();
  }

  private async request(
    path: string,
    options?: { query?: Record<string, string>; body?: Record<string, unknown> }
  ): Promise<unknown> {
    const env = loadServerEnv();
    const apiKey = this.credential?.apiKey ?? env.ACCESSTRADE_API_KEY;
    if (!apiKey) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "AccessTrade chưa được cấu hình.", 503);
    }
    const now = Date.now();
    if (this.nextRequestAt > now) {
      await new Promise((resolve) => setTimeout(resolve, this.nextRequestAt - now));
    }
    this.nextRequestAt = Date.now() + 6_000;
    const baseUrl = new URL(env.ACCESSTRADE_API_BASE_URL);
    if (baseUrl.protocol !== "https:" || baseUrl.hostname !== "api.accesstrade.vn") {
      throw new AppError("CONNECTOR_UNAVAILABLE", "AccessTrade API base URL không hợp lệ.", 503);
    }
    const url = new URL(path, baseUrl);
    Object.entries(options?.query ?? {}).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    );
    const payload = await requestProviderJson({
      provider: "AccessTrade",
      url,
      init: {
        method: options?.body ? "POST" : "GET",
        headers: {
          Authorization: `Token ${apiKey}`,
          Accept: "application/json",
          ...(options?.body ? { "Content-Type": "application/json" } : {})
        },
        ...(options?.body ? { body: JSON.stringify(options.body) } : {})
      },
      maxAttempts: 2
    });
    if (
      payload &&
      typeof payload === "object" &&
      "success" in payload &&
      (payload as { success?: unknown }).success === false
    ) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "AccessTrade từ chối yêu cầu.", 503);
    }
    return payload;
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
    const result = trackingLinkResponseSchema.parse(
      await this.request("/v1/product_link/create", {
        body: {
          campaign_id: input.campaignExternalId,
          urls: [input.target.canonicalUrl],
          sub1: input.clickToken,
          sub2: input.subIds[1],
          sub3: input.subIds[2],
          sub4: input.subIds[3]
        }
      })
    );
    const link = result.data.success_link[0];
    if (!result.success || !link) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "AccessTrade không trả về tracking URL.", 502);
    }
    return { url: safeAccessTradeTrackingUrl(link.short_link ?? link.aff_link) };
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
        await this.request("/v1/offers_informations", {
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
    let pages = 0;
    do {
      pages += 1;
      if (pages > 100) {
        throw new AppError(
          "CONNECTOR_UNAVAILABLE",
          "AccessTrade pagination vượt giới hạn an toàn.",
          503
        );
      }
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
        const commission = parseVndAmount(row.commission, "commission");
        const externalItemKey = row.product_id ?? row.conversion_id ?? "order";
        yield {
          externalOrderId: row.transaction_id,
          externalItemKey,
          clickToken:
            row.sub1 ??
            row._extra?.parameters?.sub1 ??
            row._extra?.parameters?.utm_source ??
            row._utm_source,
          purchasedAt: parseAccessTradeDate(row.transaction_time),
          ...(row.update_time
            ? { orderStatusUpdatedAt: parseAccessTradeDate(row.update_time) }
            : {}),
          grossCommissionVnd: commission,
          netCommissionVnd: commission,
          status: accessTradeOrderStatus(row.status),
          rawOrderStatus: String(row.status),
          items: [
            {
              externalItemId: externalItemKey,
              name: row.product_name,
              quantity: row.product_quantity,
              ...(row.product_price === undefined
                ? {}
                : { priceVnd: parseVndAmount(row.product_price, "product price") }),
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

  async *syncValidations(window: SyncWindow): AsyncIterable<NormalizedValidation> {
    const page = Math.max(1, Number.parseInt(window.cursor ?? "1", 10) || 1);
    const orders = pagedOrderSchema.parse(
      await this.request("/v1/order-list", {
        query: {
          since: window.start.toISOString(),
          until: window.end.toISOString(),
          page: String(page),
          limit: "4"
        }
      })
    );
    for (const order of orders.data) {
      const query = {
        order_id: order.order_id,
        merchant: order.merchant,
        page: "1",
        limit: "300"
      };
      const [products, details] = [
        pagedProductSchema.parse(await this.request("/v1/order-products", { query })),
        pagedDetailSchema.parse(await this.request("/v1/orders_detail", { query }))
      ];
      const productsById = new Map(products.data.map((product) => [product._id, product]));
      const detailCommissionTotal = details.data.reduce(
        (sum, detail) => sum + parseVndAmount(detail.pub_commission, "pub_commission"),
        0n
      );
      const orderCommission = parseVndAmount(order.pub_commission, "order pub_commission");
      const complete =
        products.total === products.data.length &&
        details.total === details.data.length &&
        products.total === details.total &&
        detailCommissionTotal === orderCommission;
      for (const detail of details.data) {
        const product = productsById.get(detail.product_id);
        const commission = parseVndAmount(detail.pub_commission, "pub_commission");
        const rawStatus = accessTradeOrderStatus(detail.status);
        const bucketCommission =
          detail.status === 1
            ? product?.commission.approved
            : detail.status === 2
              ? product?.commission.reject
              : detail.status === 0
                ? product?.commission.pending
                : undefined;
        const summaryMatches =
          detail.status === 1
            ? order.order_approved > 0
            : detail.status === 2
              ? order.order_reject > 0
              : detail.status === 0
                ? order.order_pending > 0
                : false;
        const evidenceMatches =
          complete &&
          product !== undefined &&
          bucketCommission !== undefined &&
          parseVndAmount(bucketCommission, "product commission bucket") === commission &&
          summaryMatches;
        yield {
          externalOrderId: order.order_id,
          externalItemKey: detail.product_id,
          status: evidenceMatches && rawStatus !== "pending" ? rawStatus : "review_required",
          commissionVnd: commission,
          validatedAt: parseAccessTradeDate(detail.confirmed_time ?? order.update_time),
          rawOrderStatus: String(detail.status),
          payload: {
            order,
            detail,
            product: product ?? null,
            evidenceMatches
          }
        };
      }
    }
  }
}

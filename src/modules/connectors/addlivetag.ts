import { z } from "zod";
import { Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { ConnectorBase } from "@/modules/connectors/base";
import type {
  ConnectorHealth,
  NormalizedClick,
  NormalizedConversion,
  OfferPage,
  OfferQuery,
  SyncWindow
} from "@/modules/connectors/types";
import { parseAllowedUrl } from "@/modules/connectors/url-policy";

const conversionRowSchema = z
  .object({
    order_id: z.coerce.string().optional(),
    checkout_id: z.coerce.string().optional(),
    item_id: z.coerce.string().optional(),
    sub_id: z.string().optional(),
    sub_id1: z.string().optional(),
    utm: z.string().optional(),
    purchase_time: z.union([z.string(), z.number()]),
    commission: z.coerce.number().nonnegative(),
    net_commission: z.coerce.number().nonnegative().optional(),
    status: z.union([z.string(), z.number()]).default(0),
    item_name: z.string().optional(),
    price: z.coerce.number().nonnegative().optional(),
    item_price: z.coerce.number().nonnegative().optional(),
    qty: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().int().positive().optional()
  })
  .passthrough();

const clickRowSchema = z
  .object({
    click_id: z.coerce.string(),
    click_time: z.union([z.string(), z.number()]),
    sub_id: z.string().optional()
  })
  .passthrough();

const metaSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().default(50),
  total: z.coerce.number().int().nonnegative().default(0)
});

const dealsSchema = z.array(
  z
    .object({
      id: z.coerce.string(),
      src_id: z.coerce.string().optional(),
      itemid: z.coerce.string().optional(),
      title: z.string(),
      link: z.url(),
      img: z.url().optional(),
      price: z.coerce.number().nonnegative().optional(),
      original_price: z.coerce.number().nonnegative().optional(),
      percent: z.coerce.number().nonnegative().optional()
    })
    .passthrough()
);

function statusOf(input: string | number): NormalizedConversion["status"] {
  if (input === 1 || input === "1") return "validated";
  if (input === 2 || input === "2") return "rejected";
  const value = String(input).toLowerCase();
  if (/(reject|cancel|invalid|failed)/.test(value)) return "rejected";
  if (/(approved|validated|complete|success)/.test(value)) return "validated";
  return "pending";
}

function providerDate(value: string | number): Date {
  if (typeof value === "number" || /^\d+$/.test(value)) {
    const number = Number(value);
    return new Date(number < 10_000_000_000 ? number * 1000 : number);
  }
  return new Date(value);
}

export class AddLiveTagConnector extends ConnectorBase {
  constructor(readonly platform: "SHOPEE_MARKETPLACE" | "SHOPEE_FOOD") {
    super();
  }

  private source(): "shopee" | "food" {
    return this.platform === Platform.SHOPEE_FOOD ? "food" : "shopee";
  }

  private async fetchJson(searchParams: Record<string, string>): Promise<unknown> {
    const env = loadServerEnv();
    if (!env.ADDLIVETAG_ENABLED || !env.ADDLIVETAG_CONVERSION_ENABLED || !env.ADDLIVETAG_API_KEY) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "AddLiveTag chưa được cấu hình.", 503);
    }
    const url = new URL(env.ADDLIVETAG_API_BASE_URL);
    for (const [key, value] of Object.entries(searchParams)) url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-Key": env.ADDLIVETAG_API_KEY
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        `AddLiveTag trả về HTTP ${response.status}.`,
        503
      );
    }
    return response.json();
  }

  private accountQuery(): Record<string, string> {
    const accountId = loadServerEnv().ADDLIVETAG_ACCOUNT_ID;
    return accountId ? { account_id: accountId } : {};
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.fetchJson({
        type: "orders",
        source: this.source(),
        page: "1",
        page_size: "1",
        ...this.accountQuery()
      });
      return { ok: true, checkedAt: new Date(), latencyMs: Date.now() - start };
    } catch (error) {
      return {
        ok: false,
        checkedAt: new Date(),
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : "AddLiveTag health check failed."
      };
    }
  }

  async normalizeUrl(): Promise<never> {
    throw new AppError(
      "VALIDATION_ERROR",
      "AddLiveTag account connector không trực tiếp chuẩn hóa URL.",
      400
    );
  }

  async createTrackingLink(): Promise<never> {
    throw new AppError(
      "VALIDATION_ERROR",
      "AddLiveTag account connector không trực tiếp tạo link.",
      400
    );
  }

  async listOffers(input: OfferQuery): Promise<OfferPage> {
    const env = loadServerEnv();
    const response = await fetch(env.ADDLIVETAG_DEALS_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return { offers: [] };
    const rows = dealsSchema.parse(await response.json());
    const keyword = input.keyword?.trim().toLowerCase();
    const limit = Math.min(input.limit ?? 50, 100);
    return {
      offers: rows
        .filter((row) => !keyword || row.title.toLowerCase().includes(keyword))
        .slice(0, limit)
        .flatMap((row) => {
          try {
            const originUrl = parseAllowedUrl(row.link, Platform.SHOPEE_MARKETPLACE).toString();
            return [
              {
                externalId: row.src_id ?? row.itemid ?? row.id,
                title: row.title,
                originUrl,
                imageUrl: row.img,
                ...(row.price === undefined ? {} : { priceVnd: BigInt(Math.trunc(row.price)) }),
                ...(row.original_price === undefined
                  ? {}
                  : { originalPriceVnd: BigInt(Math.trunc(row.original_price)) }),
                ...(row.percent === undefined
                  ? {}
                  : { commissionBps: Math.min(10_000, Math.round(row.percent * 100)) }),
                payload: row
              }
            ];
          } catch {
            return [];
          }
        })
    };
  }

  async *syncClicks(window: SyncWindow): AsyncIterable<NormalizedClick> {
    let page = Number(window.cursor ?? "1");
    let received = 0;
    let total = 0;
    do {
      const payload = z
        .object({
          ok: z.boolean(),
          meta: metaSchema,
          data: z.array(clickRowSchema)
        })
        .parse(
          await this.fetchJson({
            type: "clicks",
            source: this.source(),
            from: window.start.toISOString(),
            to: window.end.toISOString(),
            page: String(page),
            page_size: "100",
            ...this.accountQuery()
          })
        );
      if (!payload.ok)
        throw new AppError("CONNECTOR_UNAVAILABLE", "AddLiveTag click API failed.", 503);
      total = payload.meta.total;
      received += payload.data.length;
      for (const row of payload.data) {
        yield {
          externalClickId: row.click_id,
          clickToken: row.sub_id,
          clickedAt: providerDate(row.click_time),
          payload: row
        };
      }
      if (payload.data.length === 0) break;
      page += 1;
    } while (received < total);
  }

  async *syncConversions(window: SyncWindow): AsyncIterable<NormalizedConversion> {
    let page = Number(window.cursor ?? "1");
    let received = 0;
    let total = 0;
    do {
      const payload = z
        .object({
          ok: z.boolean(),
          meta: metaSchema,
          data: z.array(conversionRowSchema)
        })
        .parse(
          await this.fetchJson({
            type: "items",
            source: this.source(),
            from: window.start.toISOString(),
            to: window.end.toISOString(),
            page: String(page),
            page_size: "100",
            ...this.accountQuery()
          })
        );
      if (!payload.ok) {
        throw new AppError("CONNECTOR_UNAVAILABLE", "AddLiveTag conversion API failed.", 503);
      }
      total = payload.meta.total;
      received += payload.data.length;
      for (const row of payload.data) {
        const externalOrderId = row.order_id ?? row.checkout_id;
        if (!externalOrderId) continue;
        const externalItemKey = row.item_id ?? "order";
        const grossCommission = BigInt(Math.trunc(row.commission));
        const netCommission = BigInt(Math.trunc(row.net_commission ?? row.commission));
        yield {
          externalOrderId,
          externalItemKey,
          clickToken: row.sub_id1 ?? row.sub_id ?? row.utm,
          purchasedAt: providerDate(row.purchase_time),
          grossCommissionVnd: grossCommission,
          netCommissionVnd: netCommission,
          status: statusOf(row.status),
          items: [
            {
              externalItemId: externalItemKey,
              name: row.item_name,
              quantity: row.qty ?? row.quantity ?? 1,
              ...((row.price ?? row.item_price) === undefined
                ? {}
                : { priceVnd: BigInt(Math.trunc((row.price ?? row.item_price)!)) }),
              commissionVnd: netCommission,
              payload: row
            }
          ],
          payload: row
        };
      }
      if (payload.data.length === 0) break;
      page += 1;
    } while (received < total);
  }
}

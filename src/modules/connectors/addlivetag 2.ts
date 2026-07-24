import { z } from "zod";
import { Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { ConnectorBase } from "@/modules/connectors/base";
import type {
  ConnectorHealth,
  NormalizedConversion,
  OfferPage,
  OfferQuery,
  SyncWindow
} from "@/modules/connectors/types";

const conversionRowSchema = z
  .object({
    order_id: z.coerce.string(),
    item_id: z.coerce.string().default("order"),
    sub_id: z.string().optional(),
    purchase_time: z.union([z.string(), z.number()]),
    commission: z.coerce.number().nonnegative(),
    status: z.string(),
    item_name: z.string().optional(),
    item_price: z.coerce.number().nonnegative().optional(),
    quantity: z.coerce.number().int().positive().default(1)
  })
  .passthrough();

const responseSchema = z.union([
  z.array(conversionRowSchema),
  z.object({ data: z.array(conversionRowSchema), next_cursor: z.string().optional() })
]);

function statusOf(input: string): NormalizedConversion["status"] {
  const value = input.toLowerCase();
  if (/(reject|cancel|invalid|failed)/.test(value)) return "rejected";
  if (/(approved|validated|complete|success)/.test(value)) return "validated";
  return "pending";
}

export class AddLiveTagConnector extends ConnectorBase {
  constructor(readonly platform: "SHOPEE_MARKETPLACE" | "SHOPEE_FOOD") {
    super();
  }

  private source(): "shopee" | "food" {
    return this.platform === Platform.SHOPEE_FOOD ? "food" : "shopee";
  }

  private async fetchJson(path: string, searchParams: Record<string, string>): Promise<unknown> {
    const env = loadServerEnv();
    if (!env.ADDLIVETAG_ENABLED || !env.ADDLIVETAG_API_KEY) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "AddLiveTag chưa được cấu hình.", 503);
    }
    const url = new URL(path, env.ADDLIVETAG_API_BASE_URL);
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

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.fetchJson("health", { source: this.source() });
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
    const url = new URL(env.ADDLIVETAG_DEALS_URL);
    if (input.keyword) url.searchParams.set("keyword", input.keyword);
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return { offers: [] };
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return { offers: [] };
    return { offers: [] };
  }

  async *syncConversions(window: SyncWindow): AsyncIterable<NormalizedConversion> {
    const payload = await this.fetchJson("orders", {
      source: this.source(),
      from: window.start.toISOString(),
      to: window.end.toISOString(),
      ...(window.cursor ? { cursor: window.cursor } : {})
    });
    const parsed = responseSchema.parse(payload);
    const rows = Array.isArray(parsed) ? parsed : parsed.data;
    for (const row of rows) {
      const commission = BigInt(Math.trunc(row.commission));
      yield {
        externalOrderId: row.order_id,
        externalItemKey: row.item_id,
        clickToken: row.sub_id,
        purchasedAt: new Date(row.purchase_time),
        grossCommissionVnd: commission,
        netCommissionVnd: commission,
        status: statusOf(row.status),
        items: [
          {
            externalItemId: row.item_id,
            name: row.item_name,
            quantity: row.quantity,
            priceVnd: row.item_price === undefined ? undefined : BigInt(Math.trunc(row.item_price)),
            commissionVnd: commission,
            payload: row
          }
        ],
        payload: row
      };
    }
  }
}

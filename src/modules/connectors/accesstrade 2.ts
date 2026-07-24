import { z } from "zod";
import { Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { ConnectorBase } from "@/modules/connectors/base";
import type {
  ConnectorHealth,
  NormalizedAffiliateTarget,
  NormalizedConversion,
  SyncWindow,
  TrackingLinkInput,
  TrackingLinkResult
} from "@/modules/connectors/types";

const rowSchema = z
  .object({
    transaction_id: z.coerce.string(),
    merchant: z.string(),
    click_id: z.string().optional(),
    transaction_time: z.string(),
    commission: z.coerce.number(),
    status: z.string()
  })
  .passthrough();

export class AccessTradeConnector extends ConnectorBase {
  readonly platform = Platform.ACCESSTRADE;

  private async request(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const env = loadServerEnv();
    if (!env.ACCESSTRADE_ENABLED || !env.ACCESSTRADE_API_KEY || !env.ACCESSTRADE_API_BASE_URL) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "AccessTrade chưa được cấu hình.", 503);
    }
    const url = new URL(path, env.ACCESSTRADE_API_BASE_URL);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, {
      headers: { Authorization: `Token ${env.ACCESSTRADE_API_KEY}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        `AccessTrade trả về HTTP ${response.status}.`,
        503
      );
    }
    return response.json();
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const startedAt = Date.now();
    try {
      await this.request("health");
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
    const env = loadServerEnv();
    if (!env.ACCESSTRADE_PUBLISHER_ID) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "Thiếu AccessTrade publisher ID.", 503);
    }
    const result = await this.request("links", {
      url: input.target.canonicalUrl,
      publisher_id: env.ACCESSTRADE_PUBLISHER_ID,
      sub_id: input.clickToken
    });
    const parsed = z.object({ url: z.url() }).parse(result);
    return { url: parsed.url };
  }

  async *syncConversions(window: SyncWindow): AsyncIterable<NormalizedConversion> {
    const payload = await this.request("conversions", {
      from: window.start.toISOString(),
      to: window.end.toISOString(),
      ...(window.cursor ? { cursor: window.cursor } : {})
    });
    const rows = z.union([z.array(rowSchema), z.object({ data: z.array(rowSchema) })]).parse(payload);
    for (const row of Array.isArray(rows) ? rows : rows.data) {
      const commission = BigInt(Math.trunc(row.commission));
      yield {
        externalOrderId: row.transaction_id,
        externalItemKey: "order",
        clickToken: row.click_id,
        purchasedAt: new Date(row.transaction_time),
        grossCommissionVnd: commission,
        netCommissionVnd: commission,
        status: /approved|success/i.test(row.status)
          ? "validated"
          : /reject|cancel/i.test(row.status)
            ? "rejected"
            : "pending",
        items: [],
        payload: row
      };
    }
  }
}

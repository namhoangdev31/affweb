import { createHmac } from "node:crypto";
import { z } from "zod";
import { Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";
import { ConnectorBase } from "@/modules/connectors/base";
import type {
  ConnectorHealth,
  NormalizedAffiliateTarget,
  OfferPage,
  OfferQuery,
  NormalizedConversion,
  SyncWindow,
  TrackingLinkInput,
  TrackingLinkResult
} from "@/modules/connectors/types";
import { inferTargetType, parseAllowedUrl } from "@/modules/connectors/url-policy";

export function canonicalLazadaSignature(
  apiPath: string,
  parameters: Record<string, string>,
  secret: string
): string {
  const canonical = Object.entries(parameters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join("");
  return createHmac("sha256", secret).update(`${apiPath}${canonical}`).digest("hex").toUpperCase();
}

export class LazadaConnector extends ConnectorBase {
  readonly platform = Platform.LAZADA;

  private async call<T>(
    operation: string,
    parameters: Record<string, string>,
    schema: z.ZodType<T>
  ): Promise<T> {
    const env = loadServerEnv();
    if (
      env.LAZADA_MODE !== "active" ||
      !env.LAZADA_API_BASE_URL ||
      !env.LAZADA_LITE_APP_KEY ||
      !env.LAZADA_LITE_APP_SECRET ||
      !env.LAZADA_USER_TOKEN
    ) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        "Lazada đang ở credential_ready; chưa thực hiện live request.",
        503
      );
    }
    const apiPath = operation.startsWith("/") ? operation : `/${operation}`;
    const signed = {
      app_key: env.LAZADA_LITE_APP_KEY,
      userToken: env.LAZADA_USER_TOKEN,
      sign_method: "sha256",
      timestamp: String(Date.now()),
      ...parameters
    };
    const url = new URL(`${env.LAZADA_API_BASE_URL.replace(/\/$/, "")}${apiPath}`);
    Object.entries({
      ...signed,
      sign: canonicalLazadaSignature(apiPath, signed, env.LAZADA_LITE_APP_SECRET)
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      throw new AppError("CONNECTOR_UNAVAILABLE", `Lazada trả về HTTP ${response.status}.`, 503);
    }
    return schema.parse(await response.json());
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const env = loadServerEnv();
    const configured = Boolean(
      env.LAZADA_LITE_APP_KEY && env.LAZADA_LITE_APP_SECRET && env.LAZADA_USER_TOKEN
    );
    return {
      ok: env.LAZADA_MODE !== "active" || configured,
      checkedAt: new Date(),
      latencyMs: 0,
      message:
        env.LAZADA_MODE === "active"
          ? configured
            ? "Lazada active."
            : "Lazada active nhưng thiếu credential."
          : `Lazada mode: ${env.LAZADA_MODE}.`
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
    const payload = await this.call(
      loadServerEnv().LAZADA_LINK_OPERATION,
      {
        url: input.target.canonicalUrl,
        sub_id: input.clickToken
      },
      z.object({ data: z.object({ url: z.url() }) })
    );
    return { url: payload.data.url };
  }

  async listOffers(input: OfferQuery): Promise<OfferPage> {
    const itemSchema = z
      .object({
        productId: z.coerce.string(),
        productName: z.string(),
        productUrl: z.url(),
        imageUrl: z.url().optional(),
        price: z.coerce.number().nonnegative().optional(),
        originalPrice: z.coerce.number().nonnegative().optional(),
        commissionRate: z.coerce.number().nonnegative().optional()
      })
      .passthrough();
    const payload = await this.call(
      loadServerEnv().LAZADA_PRODUCT_OPERATION,
      {
        keyword: input.keyword ?? "",
        limit: String(input.limit ?? 20),
        ...(input.cursor ? { cursor: input.cursor } : {})
      },
      z.object({
        data: z.object({ items: z.array(itemSchema), next_cursor: z.string().optional() })
      })
    );
    return {
      offers: payload.data.items.map((item) => ({
        externalId: item.productId,
        title: item.productName,
        originUrl: parseAllowedUrl(item.productUrl, this.platform).toString(),
        imageUrl: item.imageUrl,
        ...(item.price === undefined ? {} : { priceVnd: BigInt(Math.trunc(item.price)) }),
        ...(item.originalPrice === undefined
          ? {}
          : { originalPriceVnd: BigInt(Math.trunc(item.originalPrice)) }),
        ...(item.commissionRate === undefined
          ? {}
          : { commissionBps: Math.min(10_000, Math.round(item.commissionRate * 100)) }),
        payload: item
      })),
      ...(payload.data.next_cursor ? { nextCursor: payload.data.next_cursor } : {})
    };
  }

  async *syncConversions(window: SyncWindow): AsyncIterable<NormalizedConversion> {
    let page = Number(window.cursor ?? "1");
    let hasNextPage = true;
    const rowSchema = z
      .object({
        orderId: z.coerce.string(),
        offerId: z.coerce.string().default("order"),
        subId: z.string().optional(),
        conversionTime: z.string(),
        payout: z.coerce.number().nonnegative(),
        status: z.string().default("pending")
      })
      .passthrough();
    while (hasNextPage) {
      const payload = await this.call(
        loadServerEnv().LAZADA_CONVERSION_OPERATION,
        {
          dateStart: window.start.toISOString().slice(0, 10),
          dateEnd: window.end.toISOString().slice(0, 10),
          page: String(page),
          limit: "100"
        },
        z
          .object({
            data: z
              .object({
                items: z.array(rowSchema).default([]),
                total: z.coerce.number().default(0)
              })
              .optional(),
            result: z.array(rowSchema).optional()
          })
          .passthrough()
      );
      const rows = payload.data?.items ?? payload.result ?? [];
      for (const row of rows) {
        const commission = BigInt(Math.trunc(row.payout));
        yield {
          externalOrderId: row.orderId,
          externalItemKey: row.offerId,
          clickToken: row.subId,
          purchasedAt: new Date(row.conversionTime),
          grossCommissionVnd: commission,
          netCommissionVnd: commission,
          status: /approved|success|validated/i.test(row.status)
            ? "validated"
            : /reject|cancel|invalid/i.test(row.status)
              ? "rejected"
              : "pending",
          items: [],
          payload: row
        };
      }
      hasNextPage = rows.length === 100 && (payload.data?.total ?? page * 100 + 1) > page * 100;
      page += 1;
    }
  }
}

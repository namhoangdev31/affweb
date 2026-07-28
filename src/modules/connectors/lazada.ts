import { createHmac } from "node:crypto";
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

type LazadaCredential = Extract<ProviderCredentialPayload, { provider: "LAZADA_OPEN_API" }>;

export function lazadaOrderStatus(value: string): NormalizedConversion["status"] {
  const status = value.trim().toLowerCase();
  if (status === "fulfilled" || status === "delivered") return "delivered";
  if (status === "returned") return "returned";
  return "review_required";
}

export function parseLazadaVietnamDate(value: string): Date {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}+07:00`
    : value;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Lazada trả về ngày giờ không hợp lệ.", 503);
  }
  return parsed;
}

function safeLazadaTrackingUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (host !== "lazada.vn" && !host.endsWith(".lazada.vn"))
  ) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Lazada trả về tracking URL không an toàn.", 502);
  }
  return url.toString();
}

export class LazadaConnector extends ConnectorBase {
  readonly platform = Platform.LAZADA;

  constructor(private readonly credential?: LazadaCredential) {
    super();
  }

  private async call<T>(
    operation: string,
    parameters: Record<string, string>,
    schema: z.ZodType<T>
  ): Promise<T> {
    const env = loadServerEnv();
    const appKey = this.credential?.appKey ?? env.LAZADA_LITE_APP_KEY;
    const appSecret = this.credential?.appSecret ?? env.LAZADA_LITE_APP_SECRET;
    const userToken = this.credential?.userToken ?? env.LAZADA_USER_TOKEN;
    if (!env.LAZADA_API_BASE_URL || !appKey || !appSecret || !userToken) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        "Lazada chưa được cấu hình đầy đủ credentials.",
        503
      );
    }
    const apiPath = operation.startsWith("/") ? operation : `/${operation}`;
    const signed = {
      app_key: appKey,
      userToken,
      sign_method: "sha256",
      timestamp: String(Date.now()),
      ...parameters
    };
    const baseUrl = new URL(env.LAZADA_API_BASE_URL);
    if (baseUrl.protocol !== "https:" || baseUrl.hostname !== "api.lazada.vn") {
      throw new AppError("CONNECTOR_UNAVAILABLE", "Lazada API base URL không hợp lệ.", 503);
    }
    const url = new URL(`${baseUrl.toString().replace(/\/$/, "")}${apiPath}`);
    Object.entries({
      ...signed,
      sign: canonicalLazadaSignature(apiPath, signed, appSecret)
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    const payload = await requestProviderJson({
      provider: "Lazada",
      url,
      maxAttempts: 2
    });
    const envelope = z
      .object({
        success: z.union([z.boolean(), z.string()]).optional(),
        error_code: z.unknown().optional(),
        error_msg: z.unknown().optional()
      })
      .passthrough()
      .parse(payload);
    if (
      envelope.success === false ||
      envelope.success === "false" ||
      (envelope.error_code !== undefined &&
        envelope.error_code !== null &&
        envelope.error_code !== "")
    ) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "Lazada từ chối yêu cầu.", 503);
    }
    return schema.parse(payload);
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const startedAt = Date.now();
    try {
      await this.call(
        "/marketing/conversion/report",
        {
          dateStart: new Date().toISOString().slice(0, 10),
          dateEnd: new Date().toISOString().slice(0, 10),
          page: "1",
          limit: "1"
        },
        z.object({}).passthrough()
      );
      return { ok: true, checkedAt: new Date(), latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        ok: false,
        checkedAt: new Date(),
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Lazada health check failed."
      };
    }
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
      "/marketing/getlink",
      {
        inputType: "url",
        inputValue: input.target.canonicalUrl,
        subAffId: input.clickToken,
        subId1: input.clickToken,
        subId2: input.subIds[1] ?? "",
        subId3: input.subIds[2] ?? "",
        subId4: input.subIds[3] ?? ""
      },
      z.object({
        success: z.boolean(),
        data: z.object({
          urlBatchGetLinkInfoList: z.array(
            z
              .object({
                originalUrl: z.url(),
                regularPromotionLink: z.url()
              })
              .passthrough()
          )
        })
      })
    );
    const link = payload.data.urlBatchGetLinkInfoList[0];
    if (!payload.success || !link) {
      throw new AppError("CONNECTOR_UNAVAILABLE", "Lazada không trả về tracking URL.", 502);
    }
    return { url: safeLazadaTrackingUrl(link.regularPromotionLink) };
  }

  async *syncConversions(window: SyncWindow): AsyncIterable<NormalizedConversion> {
    let page = Number(window.cursor ?? "1");
    let hasNextPage = true;
    let pages = 0;
    const rowSchema = z
      .object({
        orderId: z.coerce.string(),
        subOrderId: z.coerce.string(),
        offerId: z.coerce.string().optional(),
        affiliateSubId: z.string().optional(),
        subId1: z.string().optional(),
        conversionTime: z.string(),
        estPayout: z.string(),
        currency: z.string(),
        country: z.string(),
        fulfilledTime: z.string().nullish(),
        deliveredTime: z.string().nullish(),
        returnedTime: z.string().nullish(),
        status: z.string()
      })
      .passthrough();
    while (hasNextPage) {
      pages += 1;
      if (pages > 100) {
        throw new AppError(
          "CONNECTOR_UNAVAILABLE",
          "Lazada pagination vượt giới hạn an toàn.",
          503
        );
      }
      const payload = await this.call(
        "/marketing/conversion/report",
        {
          dateStart: window.start.toISOString().slice(0, 10),
          dateEnd: window.end.toISOString().slice(0, 10),
          page: String(page),
          limit: "100"
        },
        z
          .object({
            data: z
              .union([
                z.array(rowSchema),
                z.object({
                  items: z.array(rowSchema).default([]),
                  total: z.coerce.number().default(0)
                })
              ])
              .optional(),
            result: z.array(rowSchema).optional()
          })
          .passthrough()
      );
      const rows = Array.isArray(payload.data)
        ? payload.data
        : (payload.data?.items ?? payload.result ?? []);
      for (const row of rows) {
        if (row.currency.toUpperCase() !== "VND" || row.country.toUpperCase() !== "VN") {
          throw new AppError(
            "CONNECTOR_UNAVAILABLE",
            "Lazada conversion không thuộc thị trường VN/VND.",
            503
          );
        }
        const commission = parseVndAmount(row.estPayout, "estimated payout");
        const rawStatus = row.status.toLowerCase();
        const deliveredAtValue = row.deliveredTime ?? row.fulfilledTime;
        yield {
          externalOrderId: row.orderId,
          externalItemKey: row.subOrderId,
          clickToken: row.subId1 ?? row.affiliateSubId,
          purchasedAt: parseLazadaVietnamDate(row.conversionTime),
          ...(deliveredAtValue ? { deliveredAt: parseLazadaVietnamDate(deliveredAtValue) } : {}),
          rawOrderStatus: row.status,
          grossCommissionVnd: commission,
          netCommissionVnd: commission,
          status: lazadaOrderStatus(rawStatus),
          items: [],
          payload: row
        };
      }
      const total = Array.isArray(payload.data) ? undefined : payload.data?.total;
      hasNextPage = rows.length === 100 && (total ?? page * 100 + 1) > page * 100;
      page += 1;
    }
  }
}

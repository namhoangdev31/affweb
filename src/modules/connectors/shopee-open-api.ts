import { createHash } from "node:crypto";
import { z } from "zod";
import { Platform } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { ConnectorBase } from "@/modules/connectors/base";
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
import { inferTargetType, parseAllowedUrl } from "@/modules/connectors/url-policy";

const ENDPOINT = "https://open-api.affiliate.shopee.vn/graphql";

const pageInfoSchema = z.object({
  page: z.number(),
  limit: z.number(),
  hasNextPage: z.boolean()
});

export function shopeeSignature(
  appId: string,
  timestamp: number,
  payload: string,
  secret: string
): string {
  return createHash("sha256").update(`${appId}${timestamp}${payload}${secret}`).digest("hex");
}

export class ShopeeOpenApiConnector extends ConnectorBase {
  readonly platform = Platform.SHOPEE_MARKETPLACE;

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    schema: z.ZodType<T>
  ): Promise<T> {
    const appId = process.env.SHOPEE_APP_ID;
    const secret = process.env.SHOPEE_APP_SECRET;
    if (process.env.SHOPEE_OPEN_API_ENABLED !== "true" || !appId || !secret) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        "Shopee Open API chưa hỗ trợ tại thị trường Việt Nam.",
        503
      );
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ query, variables });
    const signature = shopeeSignature(appId, timestamp, payload, secret);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
        "Content-Type": "application/json"
      },
      body: payload,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        `Shopee Open API trả về HTTP ${response.status}.`,
        503
      );
    }
    const body = z
      .object({
        data: z.unknown().optional(),
        errors: z.array(z.object({ message: z.string() }).passthrough()).optional()
      })
      .parse(await response.json());
    if (body.errors?.length || !body.data) {
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        body.errors?.[0]?.message ?? "Shopee GraphQL response không hợp lệ.",
        503
      );
    }
    return schema.parse(body.data);
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const startedAt = Date.now();
    try {
      await this.graphql(
        `query Health($page: Int!, $limit: Int!) {
          shopeeOfferV2(page: $page, limit: $limit) { pageInfo { page limit hasNextPage } }
        }`,
        { page: 1, limit: 1 },
        z.object({ shopeeOfferV2: z.object({ pageInfo: pageInfoSchema }) })
      );
      return { ok: true, checkedAt: new Date(), latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        ok: false,
        checkedAt: new Date(),
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Shopee health check failed."
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
    if (input.subIds.length > 5) {
      throw new AppError("VALIDATION_ERROR", "Shopee chỉ hỗ trợ tối đa 5 SubID.", 400);
    }
    const originUrl = parseAllowedUrl(input.target.canonicalUrl, this.platform).toString();
    const data = await this.graphql(
      `mutation GenerateShortLink($input: ShortLinkInput!) {
        generateShortLink(input: $input) { shortLink }
      }`,
      { input: { originUrl, subIds: input.subIds } },
      z.object({ generateShortLink: z.object({ shortLink: z.url() }) })
    );
    return { url: data.generateShortLink.shortLink };
  }

  async listOffers(input: OfferQuery): Promise<OfferPage> {
    const page = Number(input.cursor ?? "1");
    const limit = Math.min(input.limit ?? 20, 50);
    const data = await this.graphql(
      `query ProductOffers($keyword: String, $page: Int!, $limit: Int!) {
        productOfferV2(keyword: $keyword, sortType: 1, page: $page, limit: $limit) {
          nodes {
            productId productName commissionRate price imageUrl offerLink
          }
          pageInfo { page limit hasNextPage }
        }
      }`,
      { keyword: input.keyword ?? null, page, limit },
      z.object({
        productOfferV2: z.object({
          nodes: z.array(
            z.object({
              productId: z.coerce.string(),
              productName: z.string(),
              commissionRate: z.string(),
              price: z.coerce.string(),
              imageUrl: z.url().optional(),
              offerLink: z.url()
            })
          ),
          pageInfo: pageInfoSchema
        })
      })
    );
    return {
      offers: data.productOfferV2.nodes.map((node) => ({
        externalId: node.productId,
        title: node.productName,
        originUrl: node.offerLink,
        imageUrl: node.imageUrl,
        priceVnd: BigInt(node.price),
        commissionBps: Math.round(Number(node.commissionRate) * 10_000),
        payload: node
      })),
      ...(data.productOfferV2.pageInfo.hasNextPage ? { nextCursor: String(page + 1) } : {})
    };
  }

  async *syncConversions(window: SyncWindow): AsyncIterable<NormalizedConversion> {
    let page = Number(window.cursor ?? "1");
    let hasNextPage = true;
    while (hasNextPage) {
      const data = await this.graphql(
        `query Conversions($startTime: Int!, $endTime: Int!, $page: Int!, $limit: Int!) {
          conversionReportV2(startTime: $startTime, endTime: $endTime, page: $page, limit: $limit) {
            nodes {
              orderId itemId itemName quantity price commission netCommission
              purchaseStatus purchaseTime clickTime subIds
            }
            pageInfo { page limit hasNextPage }
          }
        }`,
        {
          startTime: Math.floor(window.start.getTime() / 1000),
          endTime: Math.floor(window.end.getTime() / 1000),
          page,
          limit: 100
        },
        z.object({
          conversionReportV2: z.object({
            nodes: z.array(
              z.object({
                orderId: z.coerce.string(),
                itemId: z.coerce.string(),
                itemName: z.string().optional(),
                quantity: z.number().int().positive().default(1),
                price: z.coerce.bigint(),
                commission: z.coerce.bigint(),
                netCommission: z.coerce.bigint().optional(),
                purchaseStatus: z.number().int(),
                purchaseTime: z.number().int(),
                clickTime: z.number().int().optional(),
                subIds: z.array(z.string()).default([])
              })
            ),
            pageInfo: pageInfoSchema
          })
        })
      );
      for (const row of data.conversionReportV2.nodes) {
        const net = row.netCommission ?? row.commission;
        yield {
          externalOrderId: row.orderId,
          externalItemKey: row.itemId,
          clickToken: row.subIds[0],
          purchasedAt: new Date(row.purchaseTime * 1000),
          grossCommissionVnd: row.commission,
          netCommissionVnd: net,
          status:
            row.purchaseStatus === 1
              ? "validated"
              : row.purchaseStatus === 2
                ? "rejected"
                : "pending",
          items: [
            {
              externalItemId: row.itemId,
              name: row.itemName,
              quantity: row.quantity,
              priceVnd: row.price,
              commissionVnd: net,
              payload: row
            }
          ],
          payload: row
        };
      }
      hasNextPage = data.conversionReportV2.pageInfo.hasNextPage;
      page += 1;
    }
  }

  async *syncValidations(window: SyncWindow): AsyncIterable<NormalizedValidation> {
    let page = Number(window.cursor ?? "1");
    let hasNextPage = true;
    while (hasNextPage) {
      const data = await this.graphql(
        `query Validations($startTime: Int!, $endTime: Int!, $page: Int!, $limit: Int!) {
          validationReportV2(startTime: $startTime, endTime: $endTime, page: $page, limit: $limit) {
            nodes { orderId itemId commission validationStatus validationTime }
            pageInfo { page limit hasNextPage }
          }
        }`,
        {
          startTime: Math.floor(window.start.getTime() / 1000),
          endTime: Math.floor(window.end.getTime() / 1000),
          page,
          limit: 100
        },
        z.object({
          validationReportV2: z.object({
            nodes: z.array(
              z.object({
                orderId: z.coerce.string(),
                itemId: z.coerce.string(),
                commission: z.coerce.bigint(),
                validationStatus: z.number().int(),
                validationTime: z.number().int()
              })
            ),
            pageInfo: pageInfoSchema
          })
        })
      );
      for (const row of data.validationReportV2.nodes) {
        if (row.validationStatus === 0) continue;
        yield {
          externalOrderId: row.orderId,
          externalItemKey: row.itemId,
          status: row.validationStatus === 1 ? "validated" : "rejected",
          commissionVnd: row.commission,
          validatedAt: new Date(row.validationTime * 1000),
          payload: row
        };
      }
      hasNextPage = data.validationReportV2.pageInfo.hasNextPage;
      page += 1;
    }
  }
}

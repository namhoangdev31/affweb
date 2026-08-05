import "server-only";

import {
  ConnectorMode,
  ConnectorType,
  EvidenceAuthority,
  type Prisma,
  SyncStatus
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { AddLiveTagConnector } from "@/modules/connectors/addlivetag";
import { activeProviderCredential } from "@/modules/connectors/provider-credentials";
import { connectorFor } from "@/modules/connectors/registry";
import type { AffiliateConnector } from "@/modules/connectors/types";
import {
  ingestConversion,
  ingestValidation,
  releaseDueSafetyHolds
} from "@/modules/conversions/service";
import { storeRawEvidence, verifyEvidenceIntegrity } from "@/modules/evidence/service";
import { verifyLedgerBalance } from "@/modules/ledger/service";
import { dispatchNotifications } from "@/modules/notifications/dispatch";
import { expireSaaSInvoicesAndTenants } from "@/lib/tenant";
import { dispatchZaloOutbox } from "@/lib/zalo";
import { featureEnabled } from "@/modules/flags/service";

async function connectorKillSwitchEnabled(input: {
  connectorType: ConnectorType;
  platform: Parameters<typeof connectorFor>[0];
}): Promise<boolean> {
  if (input.connectorType === ConnectorType.LAZADA_OPEN_API) {
    return featureEnabled("connector.lazada.enabled", false);
  }
  if (input.connectorType === ConnectorType.ACCESSTRADE_API) {
    return featureEnabled("connector.accesstrade.enabled", false);
  }
  if (input.platform === "SHOPEE_FOOD") {
    return featureEnabled("connector.shopee_food.enabled", true);
  }
  return featureEnabled("connector.shopee.enabled", true);
}

async function syncConnector(
  connectorType: ConnectorType,
  platform: Parameters<typeof connectorFor>[0],
  affiliateAccountId?: string
): Promise<AffiliateConnector> {
  if (connectorType === ConnectorType.ADDLIVETAG_ACCOUNT) {
    if (platform !== "SHOPEE_MARKETPLACE" && platform !== "SHOPEE_FOOD") {
      throw new AppError("VALIDATION_ERROR", "Invalid AddLiveTag platform.", 400);
    }
    return new AddLiveTagConnector(platform);
  }
  const credential =
    connectorType === ConnectorType.ACCESSTRADE_API ||
    connectorType === ConnectorType.LAZADA_OPEN_API
      ? affiliateAccountId
        ? await activeProviderCredential(affiliateAccountId)
        : null
      : null;
  return connectorFor(platform, credential ?? undefined);
}

function authorityOf(type: ConnectorType): EvidenceAuthority {
  if (
    type === ConnectorType.SHOPEE_OPEN_API ||
    type === ConnectorType.LAZADA_OPEN_API ||
    type === ConnectorType.ACCESSTRADE_API
  ) {
    return EvidenceAuthority.AUTHORITATIVE;
  }
  if (type === ConnectorType.ADDLIVETAG_ACCOUNT) {
    return EvidenceAuthority.PROVISIONAL_AUTHORITATIVE;
  }
  return EvidenceAuthority.AUXILIARY;
}

export async function syncConversionsJob(options?: {
  connectorTypes?: ConnectorType[];
  backfill?: boolean;
}): Promise<{ accepted: number; failed: number }> {
  const configs = await db.connectorConfig.findMany({
    where: {
      enabled: true,
      mode: { in: [ConnectorMode.ACTIVE, ConnectorMode.SHADOW] },
      affiliateAccountId: { not: null },
      ...(options?.connectorTypes ? { connectorType: { in: options.connectorTypes } } : {})
    },
    include: { affiliateAccount: true }
  });
  let accepted = 0;
  let failed = 0;
  for (const config of configs) {
    if (!(await connectorKillSwitchEnabled(config))) continue;
    if (!config.affiliateAccount) continue;
    if (
      (config.connectorType === ConnectorType.LAZADA_OPEN_API ||
        config.connectorType === ConnectorType.ACCESSTRADE_API) &&
      (config.affiliateAccount.validationHoldDays === null ||
        config.affiliateAccount.validationHoldDays < 4 ||
        config.affiliateAccount.validationHoldDays > 60)
    ) {
      failed += 1;
      continue;
    }
    const connector = await syncConnector(
      config.connectorType,
      config.platform,
      config.affiliateAccount.id
    );
    const cursor = await db.connectorCursor.findUnique({
      where: {
        connectorConfigId_cursorKey: {
          connectorConfigId: config.id,
          cursorKey: "conversions"
        }
      }
    });
    const end = new Date();
    const start = options?.backfill
      ? new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      : cursor?.windowEnd
        ? new Date(cursor.windowEnd.getTime() - 48 * 60 * 60 * 1000)
        : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const run = await db.syncRun.create({
      data: {
        connectorConfigId: config.id,
        kind: "conversions",
        status: SyncStatus.RUNNING,
        windowStart: start,
        windowEnd: end,
        cursorBefore: cursor?.cursorValue ?? null,
        startedAt: new Date()
      }
    });
    let received = 0;
    let runAccepted = 0;
    try {
      for await (const conversion of connector.syncConversions({
        start,
        end,
        ...(cursor?.cursorValue ? { cursor: cursor.cursorValue } : {})
      })) {
        received += 1;
        await ingestConversion({
          source: config.connectorType,
          authority: authorityOf(config.connectorType),
          platform: config.platform,
          affiliateAccount: config.affiliateAccount,
          conversion
        });
        runAccepted += 1;
      }
      await db.$transaction([
        db.syncRun.update({
          where: { id: run.id },
          data: {
            status: SyncStatus.SUCCEEDED,
            receivedCount: received,
            acceptedCount: runAccepted,
            completedAt: new Date()
          }
        }),
        db.connectorCursor.upsert({
          where: {
            connectorConfigId_cursorKey: {
              connectorConfigId: config.id,
              cursorKey: "conversions"
            }
          },
          create: {
            connectorConfigId: config.id,
            cursorKey: "conversions",
            windowEnd: end
          },
          update: { windowEnd: end }
        }),
        db.connectorHealth.upsert({
          where: { connectorConfigId: config.id },
          create: {
            connectorConfigId: config.id,
            status: config.mode,
            checkedAt: new Date(),
            lastSuccessAt: new Date(),
            lagSeconds: 0
          },
          update: {
            status: config.mode,
            checkedAt: new Date(),
            lastSuccessAt: new Date(),
            lagSeconds: 0,
            failureCount: 0,
            message: null
          }
        })
      ]);
      accepted += runAccepted;
    } catch (error) {
      failed += 1;
      await db.$transaction([
        db.syncRun.update({
          where: { id: run.id },
          data: {
            status: SyncStatus.FAILED,
            receivedCount: received,
            acceptedCount: runAccepted,
            errorCode: "CONNECTOR_SYNC_FAILED",
            errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
            completedAt: new Date()
          }
        }),
        db.connectorHealth.upsert({
          where: { connectorConfigId: config.id },
          create: {
            connectorConfigId: config.id,
            status: ConnectorMode.DEGRADED,
            checkedAt: new Date(),
            failureCount: 1,
            message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error"
          },
          update: {
            status: ConnectorMode.DEGRADED,
            checkedAt: new Date(),
            failureCount: { increment: 1 },
            message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error"
          }
        })
      ]);
      logger.error("connector_sync_failed", {
        connectorConfigId: config.id,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }
  return { accepted, failed };
}

export async function syncAddLiveTagClicksJob(): Promise<{ accepted: number; failed: number }> {
  const configs = await db.connectorConfig.findMany({
    where: {
      enabled: true,
      connectorType: ConnectorType.ADDLIVETAG_ACCOUNT,
      mode: { in: [ConnectorMode.ACTIVE, ConnectorMode.SHADOW] },
      affiliateAccountId: { not: null }
    }
  });
  let accepted = 0;
  let failed = 0;
  for (const config of configs) {
    if (!(await connectorKillSwitchEnabled(config))) continue;
    const cursor = await db.connectorCursor.findUnique({
      where: {
        connectorConfigId_cursorKey: {
          connectorConfigId: config.id,
          cursorKey: "clicks"
        }
      }
    });
    const end = new Date();
    const start = cursor?.windowEnd
      ? new Date(cursor.windowEnd.getTime() - 48 * 60 * 60 * 1000)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const run = await db.syncRun.create({
      data: {
        connectorConfigId: config.id,
        kind: "clicks",
        status: SyncStatus.RUNNING,
        windowStart: start,
        windowEnd: end,
        startedAt: new Date()
      }
    });
    let received = 0;
    try {
      const connector = new AddLiveTagConnector(
        config.platform as "SHOPEE_MARKETPLACE" | "SHOPEE_FOOD"
      );
      for await (const click of connector.syncClicks({ start, end })) {
        received += 1;
        await storeRawEvidence({
          provider: ConnectorType.ADDLIVETAG_ACCOUNT,
          kind: "click",
          authority: EvidenceAuthority.AUXILIARY,
          externalRef: click.externalClickId,
          payload: click.payload
        });
        if (click.clickToken) {
          await db.affiliateClick.updateMany({
            where: {
              clickToken: click.clickToken,
              platform: config.platform,
              clickedAt: null
            },
            data: { clickedAt: click.clickedAt }
          });
        }
      }
      await db.$transaction([
        db.syncRun.update({
          where: { id: run.id },
          data: {
            status: SyncStatus.SUCCEEDED,
            receivedCount: received,
            acceptedCount: received,
            completedAt: new Date()
          }
        }),
        db.connectorCursor.upsert({
          where: {
            connectorConfigId_cursorKey: {
              connectorConfigId: config.id,
              cursorKey: "clicks"
            }
          },
          create: {
            connectorConfigId: config.id,
            cursorKey: "clicks",
            windowEnd: end
          },
          update: { windowEnd: end }
        })
      ]);
      accepted += received;
    } catch (error) {
      failed += 1;
      await db.syncRun.update({
        where: { id: run.id },
        data: {
          status: SyncStatus.FAILED,
          receivedCount: received,
          acceptedCount: 0,
          errorCode: "CONNECTOR_CLICK_SYNC_FAILED",
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
          completedAt: new Date()
        }
      });
    }
  }
  return { accepted, failed };
}

export async function reconcileAccessTradeOrdersJob(): Promise<{
  matched: number;
  unmatched: number;
  failed: number;
}> {
  const configs = await db.connectorConfig.findMany({
    where: {
      connectorType: ConnectorType.ACCESSTRADE_API,
      platform: "ACCESSTRADE",
      enabled: true,
      mode: ConnectorMode.ACTIVE,
      affiliateAccountId: { not: null }
    },
    include: { affiliateAccount: true }
  });
  let matched = 0;
  let unmatched = 0;
  let failed = 0;
  for (const config of configs) {
    if (
      !(await connectorKillSwitchEnabled(config)) ||
      !config.affiliateAccount ||
      config.affiliateAccount.validationHoldDays === null
    ) {
      continue;
    }
    const cursor = await db.connectorCursor.findUnique({
      where: {
        connectorConfigId_cursorKey: {
          connectorConfigId: config.id,
          cursorKey: "order-reconciliation"
        }
      }
    });
    const page = Math.max(1, Number.parseInt(cursor?.cursorValue ?? "1", 10) || 1);
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 24 * 60 * 60 * 1_000);
    const run = await db.syncRun.create({
      data: {
        connectorConfigId: config.id,
        kind: "order-reconciliation",
        status: SyncStatus.RUNNING,
        windowStart: start,
        windowEnd: end,
        cursorBefore: String(page),
        startedAt: new Date()
      }
    });
    let received = 0;
    let runMatched = 0;
    let runUnmatched = 0;
    try {
      const connector = await syncConnector(
        config.connectorType,
        config.platform,
        config.affiliateAccount.id
      );
      for await (const validation of connector.syncValidations({
        start,
        end,
        cursor: String(page)
      })) {
        received += 1;
        const result = await ingestValidation({
          source: ConnectorType.ACCESSTRADE_API,
          authority: EvidenceAuthority.AUTHORITATIVE,
          platform: "ACCESSTRADE",
          affiliateAccount: config.affiliateAccount,
          validation
        });
        if (result.matched) runMatched += 1;
        else runUnmatched += 1;
      }
      const nextPage = received > 0 ? page + 1 : 1;
      await db.$transaction([
        db.syncRun.update({
          where: { id: run.id },
          data: {
            status:
              runUnmatched > 0
                ? runMatched > 0
                  ? SyncStatus.PARTIAL
                  : SyncStatus.FAILED
                : SyncStatus.SUCCEEDED,
            receivedCount: received,
            acceptedCount: runMatched,
            rejectedCount: runUnmatched,
            cursorAfter: String(nextPage),
            completedAt: new Date()
          }
        }),
        db.connectorCursor.upsert({
          where: {
            connectorConfigId_cursorKey: {
              connectorConfigId: config.id,
              cursorKey: "order-reconciliation"
            }
          },
          create: {
            connectorConfigId: config.id,
            cursorKey: "order-reconciliation",
            cursorValue: String(nextPage),
            windowEnd: end
          },
          update: {
            cursorValue: String(nextPage),
            windowEnd: end
          }
        })
      ]);
      matched += runMatched;
      unmatched += runUnmatched;
    } catch (error) {
      failed += 1;
      await db.syncRun.update({
        where: { id: run.id },
        data: {
          status: SyncStatus.FAILED,
          receivedCount: received,
          acceptedCount: runMatched,
          rejectedCount: runUnmatched,
          errorCode: "ACCESSTRADE_RECONCILIATION_FAILED",
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
          completedAt: new Date()
        }
      });
    }
  }
  return { matched, unmatched, failed };
}

async function syncAddLiveTagJob() {
  const clicks = await syncAddLiveTagClicksJob();
  const conversions = await syncConversionsJob({
    connectorTypes: [ConnectorType.ADDLIVETAG_ACCOUNT, ConnectorType.SHOPEE_OPEN_API]
  });
  return { clicks, conversions };
}

export async function healthCheckJob() {
  const configs = await db.connectorConfig.findMany({ where: { enabled: true } });
  const results = [];
  for (const config of configs) {
    if (!(await connectorKillSwitchEnabled(config))) continue;
    const result = await (
      await syncConnector(
        config.connectorType,
        config.platform,
        config.affiliateAccountId ?? undefined
      )
    ).healthCheck();
    await db.connectorHealth.upsert({
      where: { connectorConfigId: config.id },
      create: {
        connectorConfigId: config.id,
        status: result.ok ? config.mode : ConnectorMode.DEGRADED,
        checkedAt: result.checkedAt,
        lastSuccessAt: result.ok ? result.checkedAt : null,
        lagSeconds: result.ok ? 0 : null,
        failureCount: result.ok ? 0 : 1,
        message: result.message ?? null
      },
      update: {
        status: result.ok ? config.mode : ConnectorMode.DEGRADED,
        checkedAt: result.checkedAt,
        ...(result.ok ? { lastSuccessAt: result.checkedAt, lagSeconds: 0, failureCount: 0 } : {}),
        ...(!result.ok ? { failureCount: { increment: 1 } } : {}),
        message: result.message ?? null
      }
    });
    results.push({ connectorConfigId: config.id, ...result });
  }
  return results;
}

export async function syncOffersJob() {
  const configs = await db.connectorConfig.findMany({
    where: {
      enabled: true,
      mode: { in: [ConnectorMode.ACTIVE, ConnectorMode.SHADOW] },
      connectorType: {
        in: [
          ConnectorType.ADDLIVETAG_ACCOUNT,
          ConnectorType.SHOPEE_OPEN_API,
          ConnectorType.ACCESSTRADE_API,
          ConnectorType.LAZADA_OPEN_API
        ]
      }
    }
  });
  let synced = 0;
  let failed = 0;
  for (const config of configs) {
    if (!(await connectorKillSwitchEnabled(config))) continue;
    if (
      config.connectorType === ConnectorType.ADDLIVETAG_ACCOUNT &&
      config.platform !== "SHOPEE_MARKETPLACE"
    ) {
      continue;
    }
    try {
      const connector = await syncConnector(
        config.connectorType,
        config.platform,
        config.affiliateAccountId ?? undefined
      );
      let cursor: string | undefined;
      let pages = 0;
      do {
        const result = await connector.listOffers({ limit: 100, ...(cursor ? { cursor } : {}) });
        for (const offer of result.offers) {
          await db.offerSnapshot.upsert({
            where: {
              provider_externalOfferId: {
                provider: config.connectorType,
                externalOfferId: offer.externalId
              }
            },
            create: {
              platform: config.platform,
              provider: config.connectorType,
              externalOfferId: offer.externalId,
              title: offer.title,
              imageUrl: offer.imageUrl ?? null,
              originUrl: offer.originUrl,
              priceVnd: offer.priceVnd ?? null,
              originalPriceVnd: offer.originalPriceVnd ?? null,
              commissionBps: offer.commissionBps ?? null,
              authority: authorityOf(config.connectorType),
              payload: offer.payload as Prisma.InputJsonValue,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            },
            update: {
              title: offer.title,
              imageUrl: offer.imageUrl ?? null,
              originUrl: offer.originUrl,
              priceVnd: offer.priceVnd ?? null,
              originalPriceVnd: offer.originalPriceVnd ?? null,
              commissionBps: offer.commissionBps ?? null,
              payload: offer.payload as Prisma.InputJsonValue,
              fetchedAt: new Date(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              quarantinedAt: null,
              quarantineReason: null
            }
          });
          synced += 1;
        }
        cursor = result.nextCursor;
        pages += 1;
      } while (cursor && pages < 20);
    } catch (error) {
      failed += 1;
      logger.error("offer_sync_failed", {
        connectorConfigId: config.id,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }
  return { synced, failed };
}

export async function payoutReconciliationJob() {
  return {
    reconciled: 0,
    tenantReconciled: 0,
    disabled: true,
    reason: "Global payout polling is disabled; use record-scoped reconciliation."
  };
}

export async function runJob(name: string) {
  switch (name) {
    case "connector-health":
      return healthCheckJob();
    case "sync-conversions":
      return syncConversionsJob();
    case "sync-addlivetag":
      return syncAddLiveTagJob();
    case "sync-accesstrade":
      return syncConversionsJob({ connectorTypes: [ConnectorType.ACCESSTRADE_API] });
    case "reconcile-accesstrade-orders":
      return reconcileAccessTradeOrdersJob();
    case "sync-lazada":
      return syncConversionsJob({ connectorTypes: [ConnectorType.LAZADA_OPEN_API] });
    case "backfill-conversions":
      return syncConversionsJob({ backfill: true });
    case "release-safety-holds":
      return releaseDueSafetyHolds();
    case "sync-offers":
      return syncOffersJob();
    case "payout-reconciliation":
      return payoutReconciliationJob();
    case "ledger-invariant":
      return verifyLedgerBalance();
    case "notification-dispatch":
      return dispatchNotifications();
    case "zalo-dispatch":
      return dispatchZaloOutbox();
    case "saas-lifecycle":
      return expireSaaSInvoicesAndTenants();
    case "evidence-integrity":
      return verifyEvidenceIntegrity();
    default:
      throw new AppError("NOT_FOUND", `Unknown job: ${name}`, 404);
  }
}

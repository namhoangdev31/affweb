"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ConnectorType,
  EvidenceAuthority,
  ReconciliationStatus,
  Role,
  SyncStatus
} from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { csvRecords } from "@/lib/csv";
import { db } from "@/lib/db";
import { requireRecentFinancePasskey } from "@/modules/admin/passkey";
import { ingestConversion } from "@/modules/conversions/service";
import { storeRawEvidence } from "@/modules/evidence/service";

const csvRowSchema = z.object({
  externalOrderId: z.string().min(1).max(200),
  externalItemKey: z.string().min(1).max(200),
  clickToken: z.string().max(200).optional(),
  purchasedAt: z.iso.datetime({ offset: true }),
  grossCommissionVnd: z.coerce.bigint().nonnegative(),
  netCommissionVnd: z.coerce.bigint().nonnegative(),
  status: z.enum(["pending", "validated", "rejected"]),
  externalItemId: z.string().min(1).max(200),
  itemName: z.string().max(500).optional(),
  quantity: z.coerce.number().int().min(1).max(100_000),
  priceVnd: z.coerce.bigint().nonnegative().optional(),
  commissionVnd: z.coerce.bigint().nonnegative()
});

function authorityOf(source: ConnectorType) {
  if (source === ConnectorType.SHOPEE_OPEN_API || source === ConnectorType.LAZADA_OPEN_API) {
    return EvidenceAuthority.AUTHORITATIVE;
  }
  if (source === ConnectorType.ADDLIVETAG_ACCOUNT || source === ConnectorType.ACCESSTRADE_API) {
    return EvidenceAuthority.PROVISIONAL_AUTHORITATIVE;
  }
  return EvidenceAuthority.AUXILIARY;
}

export async function importConversionsCsvAction(formData: FormData) {
  const actor = await requireRole([Role.FINANCE_REVIEWER, Role.SUPER_ADMIN]);
  await requireRecentFinancePasskey(actor.id);
  const affiliateAccountId = z.string().cuid().parse(formData.get("affiliateAccountId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024) {
    throw new Error("CSV phải có dung lượng từ 1 byte đến 2 MB.");
  }
  const content = await file.text();
  const records = csvRecords(content);
  if (records.length === 0 || records.length > 250) {
    throw new Error("CSV phải có từ 1 đến 250 dòng dữ liệu mỗi batch.");
  }
  const rows = records.map((row) =>
    csvRowSchema.parse({
      ...row,
      clickToken: row.clickToken || undefined,
      itemName: row.itemName || undefined,
      priceVnd: row.priceVnd || undefined
    })
  );
  const account = await db.affiliateAccount.findUniqueOrThrow({
    where: { id: affiliateAccountId },
    include: {
      connectorConfigs: {
        where: { enabled: true },
        take: 1
      }
    }
  });
  const config = account.connectorConfigs[0];
  if (!config) throw new Error("Affiliate account chưa có connector config đang bật.");

  const sourceEvidence = await storeRawEvidence({
    provider: account.connectorType,
    kind: "conversion-csv-import",
    authority: authorityOf(account.connectorType),
    payload: {
      filename: file.name.slice(0, 200),
      content,
      importedByUserId: actor.id
    }
  });
  const run = await db.syncRun.create({
    data: {
      connectorConfigId: config.id,
      kind: "conversion-csv-import",
      status: SyncStatus.RUNNING,
      receivedCount: rows.length,
      startedAt: new Date()
    }
  });

  let accepted = 0;
  let rejected = 0;
  const rejectionReasons: string[] = [];
  for (const row of rows) {
    try {
      await ingestConversion({
        source: account.connectorType,
        authority: authorityOf(account.connectorType),
        platform: account.platform,
        affiliateAccount: account,
        conversion: {
          externalOrderId: row.externalOrderId,
          externalItemKey: row.externalItemKey,
          ...(row.clickToken ? { clickToken: row.clickToken } : {}),
          purchasedAt: new Date(row.purchasedAt),
          grossCommissionVnd: row.grossCommissionVnd,
          netCommissionVnd: row.netCommissionVnd,
          status: row.status,
          items: [
            {
              externalItemId: row.externalItemId,
              ...(row.itemName ? { name: row.itemName } : {}),
              quantity: row.quantity,
              ...(row.priceVnd !== undefined ? { priceVnd: row.priceVnd } : {}),
              commissionVnd: row.commissionVnd,
              payload: { importEvidenceId: sourceEvidence.id }
            }
          ],
          payload: {
            importEvidenceId: sourceEvidence.id,
            row: {
              externalOrderId: row.externalOrderId,
              externalItemKey: row.externalItemKey,
              clickToken: row.clickToken ?? null,
              purchasedAt: row.purchasedAt,
              grossCommissionVnd: row.grossCommissionVnd.toString(),
              netCommissionVnd: row.netCommissionVnd.toString(),
              status: row.status,
              externalItemId: row.externalItemId,
              itemName: row.itemName ?? null,
              quantity: row.quantity,
              priceVnd: row.priceVnd?.toString() ?? null,
              commissionVnd: row.commissionVnd.toString()
            }
          }
        }
      });
      accepted += 1;
    } catch (error) {
      rejected += 1;
      if (rejectionReasons.length < 20) {
        rejectionReasons.push(error instanceof Error ? error.message.slice(0, 300) : "unknown");
      }
    }
  }
  await db.$transaction(async (tx) => {
    await tx.syncRun.update({
      where: { id: run.id },
      data: {
        status:
          rejected === 0
            ? SyncStatus.SUCCEEDED
            : accepted > 0
              ? SyncStatus.PARTIAL
              : SyncStatus.FAILED,
        acceptedCount: accepted,
        rejectedCount: rejected,
        completedAt: new Date(),
        ...(rejected > 0
          ? {
              errorCode: "CSV_ROWS_REJECTED",
              errorMessage: `${rejected} dòng không nhập được; kiểm tra reconciliation.`
            }
          : {})
      }
    });
    if (rejected > 0) {
      await tx.reconciliationCase.create({
        data: {
          platform: account.platform,
          status: ReconciliationStatus.OPEN,
          severity: "CSV_IMPORT_REVIEW",
          reason: `${rejected} conversion CSV row(s) were rejected.`,
          sourceSummary: {
            syncRunId: run.id,
            rawEvidenceId: sourceEvidence.id,
            accepted,
            rejected,
            reasons: rejectionReasons
          }
        }
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "conversion_csv.imported",
        entityType: "SyncRun",
        entityId: run.id,
        after: {
          affiliateAccountId,
          accepted,
          rejected,
          rawEvidenceId: sourceEvidence.id
        }
      }
    });
  });
  revalidatePath("/admin/reconciliation");
}

export async function resolveReconciliationAction(formData: FormData) {
  const actor = await requireRole([Role.FINANCE_REVIEWER, Role.FINANCE_APPROVER, Role.SUPER_ADMIN]);
  const input = z
    .object({
      id: z.string().cuid(),
      status: z.enum([
        ReconciliationStatus.MATCHED,
        ReconciliationStatus.ADJUSTED,
        ReconciliationStatus.DISMISSED
      ]),
      resolution: z.string().trim().min(12).max(2_000)
    })
    .parse(Object.fromEntries(formData));
  await db.$transaction(async (tx) => {
    const before = await tx.reconciliationCase.findUniqueOrThrow({ where: { id: input.id } });
    await tx.reconciliationCase.update({
      where: { id: input.id },
      data: {
        status: input.status,
        resolution: input.resolution,
        resolvedByUserId: actor.id,
        resolvedAt: new Date()
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "reconciliation.resolved",
        entityType: "ReconciliationCase",
        entityId: input.id,
        before: { status: before.status },
        after: { status: input.status, resolution: input.resolution }
      }
    });
  });
  revalidatePath("/admin/reconciliation");
}

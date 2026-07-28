import {
  ConnectorType,
  EvidenceAuthority,
  SyncStatus,
  TenantImportStatus
} from "@/generated/prisma/client";
import { csvRecords, parseCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseVndAmount } from "@/lib/money";
import { ingestConversion } from "@/modules/conversions/service";
import { storeRawEvidence } from "@/modules/evidence/service";

export const SHOPEE_ORDERS_SCHEMA_VERSION = "SHOPEE_CONVERSION_REPORT_V1_47";

const EXPECTED_HEADERS = [
  "ID đơn hàng",
  "Trạng thái đặt hàng",
  "Checkout id",
  "Thời Gian Đặt Hàng",
  "Thời gian hoàn thành",
  "Thời gian Click",
  "Tên Shop",
  "Shop id",
  "Loại Shop",
  "Item id",
  "Tên Item",
  "ID Model",
  "Loại sản phẩm",
  "Promotion id",
  "L1 Danh mục toàn cầu",
  "L2 Danh mục toàn cầu",
  "L3 Danh mục toàn cầu",
  "Giá(₫)",
  "Số lượng",
  "Loại Hoa hồng",
  "Đối tác chiến dịch",
  "Giá trị đơn hàng (₫)",
  "Số tiền hoàn trả (₫)",
  "Tỷ lệ sản phẩm hoa hồng Shopee",
  "Hoa hồng Shopee trên sản phẩm(₫)",
  "Tỷ lệ sản phẩm hoa hồng người bán",
  "Hoa hồng Xtra trên sản phẩm(₫)",
  "Tổng hoa hồng sản phẩm(₫)",
  "Hoa hồng đơn hàng từ Shopee(₫)",
  "Hoa hồng đơn hàng từ Người bán(₫)",
  "Tổng hoa hồng đơn hàng(₫)",
  "Tên MNC đã liên kết",
  "Mã hợp đồng MCN",
  "Mức phí quản lý MCN",
  "Phí quản lý MCN(₫)",
  "Mức hoa hồng tiếp thị liên kết theo thỏa thuận",
  "Hoa hồng ròng tiếp thị liên kết(₫)",
  "Trạng thái sản phẩm liên kết",
  "Ghi chú sản phẩm",
  "Loại thuộc tính",
  "Trạng thái người mua",
  "Sub_id1",
  "Sub_id2",
  "Sub_id3",
  "Sub_id4",
  "Sub_id5",
  "Kênh"
] as const;

const HEADER_ALIASES = new Map<string, string>([
  ["Đối tác chiến dịchr", "Đối tác chiến dịch"],
  ["Tỷ lệ sản phẩm hoa hồng Shope", "Tỷ lệ sản phẩm hoa hồng Shopee"]
]);

type ShopeeOrderRow = {
  rowNumber: number;
  externalOrderId: string;
  externalItemKey: string;
  externalItemId: string;
  itemName?: string;
  clickToken: string;
  purchasedAt: Date;
  deliveredAt: Date;
  quantity: number;
  priceVnd: bigint;
  commissionVnd: bigint;
  rawOrderStatus: string;
};

export type ShopeeOrderQuarantine = {
  rowNumber: number;
  code: string;
};

function normalizeHeader(value: string): string {
  const header = value
    .trim()
    .replace(/^\uFEFF/, "")
    .normalize("NFC");
  return HEADER_ALIASES.get(header) ?? header;
}

function parseVietnamDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    throw new AppError("VALIDATION_ERROR", `${field} không đúng định dạng export Shopee.`, 400);
  }
  const parsed = new Date(`${value.replace(" ", "T")}+07:00`);
  if (!Number.isFinite(parsed.getTime())) {
    throw new AppError("VALIDATION_ERROR", `${field} không hợp lệ.`, 400);
  }
  return parsed;
}

function parsePositiveInteger(value: string, field: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new AppError("VALIDATION_ERROR", `${field} phải là số nguyên dương.`, 400);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new AppError("VALIDATION_ERROR", `${field} vượt giới hạn.`, 400);
  }
  return parsed;
}

function validateHeaders(content: string): void {
  const [rawHeaders, ...rawRows] = parseCsv(content);
  if (!rawHeaders) {
    throw new AppError("VALIDATION_ERROR", "CSV Shopee không có header.", 400);
  }
  const headers = rawHeaders.map(normalizeHeader);
  if (
    headers.length !== EXPECTED_HEADERS.length ||
    rawRows.some((row) => row.length !== EXPECTED_HEADERS.length) ||
    EXPECTED_HEADERS.some((header, index) => headers[index] !== header)
  ) {
    throw new AppError("VALIDATION_ERROR", `CSV không khớp ${SHOPEE_ORDERS_SCHEMA_VERSION}.`, 400);
  }
}

export function parseShopeeOrdersCsv(content: string): {
  rows: ShopeeOrderRow[];
  quarantined: ShopeeOrderQuarantine[];
} {
  validateHeaders(content);
  const records = csvRecords(content);
  if (records.length === 0 || records.length > 10_000) {
    throw new AppError("VALIDATION_ERROR", "CSV phải có từ 1 đến 10.000 dòng.", 400);
  }
  const rows: ShopeeOrderRow[] = [];
  const quarantined: ShopeeOrderQuarantine[] = [];
  const naturalKeys = new Set<string>();
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const row = Object.fromEntries(
      Object.entries(record).map(([header, value]) => [normalizeHeader(header), value.trim()])
    );
    if (row["Trạng thái đặt hàng"] !== "Hoàn thành") {
      quarantined.push({ rowNumber, code: "UNKNOWN_ORDER_STATUS" });
      return;
    }
    if (!row.Sub_id1) {
      quarantined.push({ rowNumber, code: "EMPTY_SUB_ID_1" });
      return;
    }
    try {
      const orderId = row["ID đơn hàng"];
      const itemId = row["Item id"];
      const modelId = row["ID Model"];
      if (!orderId || !itemId) {
        quarantined.push({ rowNumber, code: "MISSING_NATURAL_KEY" });
        return;
      }
      const externalItemKey = `${itemId}:${modelId || "default"}`;
      const naturalKey = `${orderId}\u0000${externalItemKey}`;
      if (naturalKeys.has(naturalKey)) {
        quarantined.push({ rowNumber, code: "DUPLICATE_NATURAL_KEY" });
        return;
      }
      naturalKeys.add(naturalKey);
      const deliveredAt = parseVietnamDate(
        row["Thời gian hoàn thành"] ?? "",
        "Thời gian hoàn thành"
      );
      rows.push({
        rowNumber,
        externalOrderId: orderId,
        externalItemKey,
        externalItemId: itemId,
        ...(row["Tên Item"] ? { itemName: row["Tên Item"] } : {}),
        clickToken: row.Sub_id1,
        purchasedAt: parseVietnamDate(row["Thời Gian Đặt Hàng"] ?? "", "Thời Gian Đặt Hàng"),
        deliveredAt,
        quantity: parsePositiveInteger(row["Số lượng"] ?? "", "Số lượng"),
        priceVnd: parseVndAmount(row["Giá(₫)"] ?? "", "Giá"),
        commissionVnd: parseVndAmount(
          row["Tổng hoa hồng sản phẩm(₫)"] ?? "",
          "Tổng hoa hồng sản phẩm"
        ),
        rawOrderStatus: row["Trạng thái đặt hàng"]
      });
    } catch {
      quarantined.push({ rowNumber, code: "INVALID_ROW" });
    }
  });
  return { rows, quarantined };
}

export async function importShopeeOrders(input: {
  actorUserId: string;
  affiliateAccountId: string;
  filename: string;
  content: string;
}) {
  const account = await db.affiliateAccount.findUnique({
    where: { id: input.affiliateAccountId },
    include: {
      connectorConfigs: {
        where: { connectorType: ConnectorType.SHOPEE_DIRECT },
        take: 1
      }
    }
  });
  if (
    !account ||
    account.connectorType !== ConnectorType.SHOPEE_DIRECT ||
    account.platform !== "SHOPEE_MARKETPLACE"
  ) {
    throw new AppError("VALIDATION_ERROR", "Shopee provider account không hợp lệ.", 400);
  }
  const sourceEvidence = await storeRawEvidence({
    provider: ConnectorType.SHOPEE_DIRECT,
    kind: "shopee-orders-csv",
    authority: EvidenceAuthority.AUTHORITATIVE,
    payload: null,
    rawBody: input.content,
    contentType: "text/csv; charset=utf-8",
    extension: "csv",
    metadata: {
      filename: input.filename.slice(0, 200),
      importedByUserId: input.actorUserId,
      schemaVersion: SHOPEE_ORDERS_SCHEMA_VERSION
    },
    schemaVersion: 1
  });
  if (account.tenantId) {
    const replay = await db.tenantConversionImport.findUnique({
      where: {
        tenantId_fileSha256: {
          tenantId: account.tenantId,
          fileSha256: sourceEvidence.sha256
        }
      }
    });
    if (replay) return replay;
  }
  const parsed = parseShopeeOrdersCsv(input.content);
  const config =
    account.connectorConfigs[0] ??
    (await db.connectorConfig.create({
      data: {
        affiliateAccountId: account.id,
        connectorType: ConnectorType.SHOPEE_DIRECT,
        platform: "SHOPEE_MARKETPLACE",
        tenantId: account.tenantId,
        enabled: true,
        mode: "ACTIVE"
      }
    }));
  const run = await db.syncRun.create({
    data: {
      connectorConfigId: config.id,
      kind: "shopee-orders-csv",
      status: SyncStatus.RUNNING,
      receivedCount: parsed.rows.length + parsed.quarantined.length,
      startedAt: new Date()
    }
  });
  const tenantImport = account.tenantId
    ? await db.tenantConversionImport.create({
        data: {
          tenantId: account.tenantId,
          rawEvidenceId: sourceEvidence.id,
          fileSha256: sourceEvidence.sha256,
          status: TenantImportStatus.RUNNING,
          totalRows: parsed.rows.length + parsed.quarantined.length
        }
      })
    : null;
  let accepted = 0;
  let duplicates = 0;
  const quarantined = [...parsed.quarantined];
  const observedAt = new Date();
  for (const row of parsed.rows) {
    const attributedClick = await db.affiliateClick.findFirst({
      where: {
        clickToken: row.clickToken,
        affiliateAccountId: account.id
      },
      select: { id: true }
    });
    if (!attributedClick) {
      quarantined.push({ rowNumber: row.rowNumber, code: "UNMATCHED_SUB_ID_1" });
      continue;
    }
    try {
      const result = await ingestConversion({
        source: ConnectorType.SHOPEE_DIRECT,
        authority: EvidenceAuthority.AUTHORITATIVE,
        platform: "SHOPEE_MARKETPLACE",
        affiliateAccount: account,
        conversion: {
          externalOrderId: row.externalOrderId,
          externalItemKey: row.externalItemKey,
          clickToken: row.clickToken,
          purchasedAt: row.purchasedAt,
          deliveredAt: row.deliveredAt,
          orderStatusUpdatedAt: observedAt,
          rawOrderStatus: row.rawOrderStatus,
          grossCommissionVnd: row.commissionVnd,
          netCommissionVnd: row.commissionVnd,
          status: "delivered",
          items: [
            {
              externalItemId: row.externalItemId,
              ...(row.itemName ? { name: row.itemName } : {}),
              quantity: row.quantity,
              priceVnd: row.priceVnd,
              commissionVnd: row.commissionVnd,
              payload: { sourceEvidenceId: sourceEvidence.id }
            }
          ],
          payload: {
            sourceEvidenceId: sourceEvidence.id,
            schemaVersion: SHOPEE_ORDERS_SCHEMA_VERSION,
            rowNumber: row.rowNumber
          }
        }
      });
      accepted += result.created ? 1 : 0;
      duplicates += result.deduplicated ? 1 : 0;
    } catch {
      quarantined.push({ rowNumber: row.rowNumber, code: "INGESTION_REJECTED" });
    }
  }
  const status =
    quarantined.length === 0
      ? SyncStatus.SUCCEEDED
      : accepted + duplicates > 0
        ? SyncStatus.PARTIAL
        : SyncStatus.FAILED;
  await db.$transaction(async (tx) => {
    await tx.syncRun.update({
      where: { id: run.id },
      data: {
        status,
        acceptedCount: accepted,
        rejectedCount: quarantined.length,
        completedAt: new Date(),
        ...(quarantined.length > 0
          ? {
              errorCode: "SHOPEE_ROWS_QUARANTINED",
              errorMessage: `${quarantined.length} dòng cần kiểm tra.`
            }
          : {})
      }
    });
    await tx.connectorHealth.upsert({
      where: { connectorConfigId: config.id },
      create: {
        connectorConfigId: config.id,
        status: accepted + duplicates > 0 ? "ACTIVE" : "DEGRADED",
        checkedAt: new Date(),
        lastSuccessAt: accepted + duplicates > 0 ? new Date() : null,
        lagSeconds: 0,
        failureCount: accepted + duplicates > 0 ? 0 : 1,
        message: quarantined.length > 0 ? `${quarantined.length} Shopee row(s) quarantined.` : null
      },
      update: {
        status: accepted + duplicates > 0 ? "ACTIVE" : "DEGRADED",
        checkedAt: new Date(),
        ...(accepted + duplicates > 0
          ? { lastSuccessAt: new Date(), lagSeconds: 0, failureCount: 0 }
          : { failureCount: { increment: 1 } }),
        message: quarantined.length > 0 ? `${quarantined.length} Shopee row(s) quarantined.` : null
      }
    });
    if (tenantImport) {
      await tx.tenantConversionImport.update({
        where: { id: tenantImport.id },
        data: {
          status:
            status === SyncStatus.SUCCEEDED
              ? TenantImportStatus.SUCCEEDED
              : status === SyncStatus.PARTIAL
                ? TenantImportStatus.PARTIAL
                : TenantImportStatus.FAILED,
          acceptedRows: accepted,
          duplicateRows: duplicates,
          quarantinedRows: quarantined.length,
          errorCode: quarantined.length > 0 ? "SHOPEE_ROWS_QUARANTINED" : null,
          errorMessage: quarantined.length > 0 ? `${quarantined.length} dòng cần kiểm tra.` : null,
          completedAt: new Date()
        }
      });
    }
    if (quarantined.length > 0) {
      await tx.reconciliationCase.create({
        data: {
          platform: "SHOPEE_MARKETPLACE",
          severity: "SHOPEE_IMPORT_REVIEW",
          reason: `${quarantined.length} Shopee order row(s) were quarantined.`,
          sourceSummary: {
            syncRunId: run.id,
            rawEvidenceId: sourceEvidence.id,
            schemaVersion: SHOPEE_ORDERS_SCHEMA_VERSION,
            counts: Object.fromEntries(
              Array.from(
                quarantined.reduce(
                  (counts, row) => counts.set(row.code, (counts.get(row.code) ?? 0) + 1),
                  new Map<string, number>()
                )
              )
            )
          }
        }
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: "shopee_orders.imported",
        entityType: "SyncRun",
        entityId: run.id,
        after: {
          accountFingerprint: account.fingerprint,
          evidenceSha256: sourceEvidence.sha256,
          accepted,
          duplicates,
          quarantined: quarantined.length
        }
      }
    });
  });
  return {
    id: tenantImport?.id ?? run.id,
    status,
    totalRows: parsed.rows.length + parsed.quarantined.length,
    acceptedRows: accepted,
    duplicateRows: duplicates,
    quarantinedRows: quarantined.length,
    evidenceSha256: sourceEvidence.sha256
  };
}

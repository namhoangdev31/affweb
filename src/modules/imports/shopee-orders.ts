import {
  ConnectorType,
  EvidenceAuthority,
  SyncStatus,
  TenantImportStatus
} from "@/generated/prisma/client";
import { parseCsv } from "@/lib/csv";
import { stableHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseVndAmount } from "@/lib/money";
import { ingestConversion } from "@/modules/conversions/service";
import { storeRawEvidence } from "@/modules/evidence/service";

export const SHOPEE_CONVERSION_SCHEMA_VI = "shopee-conversion-vi-47-v1";
export const SHOPEE_CONVERSION_SCHEMA_EN = "shopee-conversion-en-47-v1";
export const SHOPEE_ORDERS_SCHEMA_VERSION = SHOPEE_CONVERSION_SCHEMA_VI;

const VI_HEADERS = [
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
  "Đối tác chiến dịchr",
  "Giá trị đơn hàng (₫)",
  "Số tiền hoàn trả (₫)",
  "Tỷ lệ sản phẩm hoa hồng Shope",
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

const EN_HEADERS = [
  "Order id",
  "Order Status",
  "Conversion id",
  "Order Time",
  "Complete Time",
  "Click Time",
  "Shop Name",
  "Shop id",
  "Shop Type",
  "Item id",
  "Item Name",
  "Model id",
  "Product Type",
  "Promotion id",
  "L1 Global Category",
  "L2 Global Category",
  "L3 Global Category",
  "Price(₫)",
  "Qty",
  "Offer Type",
  "Campaign Partner",
  "Purchase Value(₫)",
  "Refund Amount(₫)",
  "Item Shopee Commission Rate",
  "Item Shopee Commission(₫)",
  "Item Seller Commission Rate",
  "Item Seller Commission(₫)",
  "Item Total Commission(₫)",
  "Order Shopee Commission(₫)",
  "Order Seller Commission(₫)",
  "Total Order Commission(₫)",
  "Linked MCN Name",
  "MCN Contract id",
  "MCN Management Fee Rate",
  "MCN Management Fee(₫)",
  "Affiliate Agreement Fee Rate",
  "Affiliate Net Commission(₫)",
  "Affiliate Item Status",
  "Item Note",
  "Attribution Type",
  "Buyer Status",
  "Sub_id1",
  "Sub_id2",
  "Sub_id3",
  "Sub_id4",
  "Sub_id5",
  "Channel"
] as const;

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_CSV_ROWS = 10_000;
const MAX_CELL_CHARS = 4_096;

type ShopeeSchema = {
  version: typeof SHOPEE_CONVERSION_SCHEMA_VI | typeof SHOPEE_CONVERSION_SCHEMA_EN;
  headers: readonly string[];
  completedStatus: string;
};

const SCHEMAS: readonly ShopeeSchema[] = [
  { version: SHOPEE_CONVERSION_SCHEMA_VI, headers: VI_HEADERS, completedStatus: "Hoàn thành" },
  { version: SHOPEE_CONVERSION_SCHEMA_EN, headers: EN_HEADERS, completedStatus: "Completed" }
];

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
  subIdVersion: "legacy" | "v2";
};

export type ShopeeOrderQuarantine = {
  rowNumber: number;
  code: string;
};

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

function matchesHeaders(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && expected.every((header, index) => actual[index] === header)
  );
}

function parseAndValidateCsv(content: string): { schema: ShopeeSchema; rows: string[][] } {
  if (Buffer.byteLength(content, "utf8") > MAX_CSV_BYTES) {
    throw new AppError("VALIDATION_ERROR", "CSV Shopee vượt giới hạn 2 MB.", 413);
  }
  const [rawHeaders, ...rawRows] = parseCsv(content);
  if (!rawHeaders) {
    throw new AppError("VALIDATION_ERROR", "CSV Shopee không có header.", 400);
  }
  const headers = rawHeaders.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim().normalize("NFC")
  );
  const schema = SCHEMAS.find((candidate) => matchesHeaders(headers, candidate.headers));
  if (!schema) {
    throw new AppError(
      "VALIDATION_ERROR",
      `CSV không khớp ${SHOPEE_CONVERSION_SCHEMA_VI} hoặc ${SHOPEE_CONVERSION_SCHEMA_EN}.`,
      400
    );
  }
  if (rawRows.length === 0 || rawRows.length > MAX_CSV_ROWS) {
    throw new AppError("VALIDATION_ERROR", "CSV phải có từ 1 đến 10.000 dòng.", 400);
  }
  for (const row of rawRows) {
    if (row.length !== schema.headers.length) {
      throw new AppError("VALIDATION_ERROR", `CSV không khớp ${schema.version}.`, 400);
    }
    for (const cell of row) {
      const value = cell.trim();
      if (value.length > MAX_CELL_CHARS) {
        throw new AppError("VALIDATION_ERROR", "CSV có cell vượt giới hạn 4.096 ký tự.", 400);
      }
      if (/^[=+@]/.test(value) || /^-[A-Za-z=(]/.test(value)) {
        throw new AppError("VALIDATION_ERROR", "CSV chứa công thức không an toàn.", 400);
      }
    }
  }
  return { schema, rows: rawRows };
}

function resolveClickToken(cells: readonly string[]): { token: string; version: "legacy" | "v2" } {
  const subIds = cells.slice(41, 46).map((value) => value.trim());
  if (subIds[4] === "v2") {
    if (
      subIds[0] !== "affweb" ||
      !/^[A-Za-z0-9]+$/.test(subIds[1] ?? "") ||
      !["web", "zalo"].includes(subIds[2] ?? "") ||
      !["cashback", "tenant"].includes(subIds[3] ?? "")
    ) {
      throw new AppError("VALIDATION_ERROR", "Shopee Sub ID v2 không hợp lệ.", 400);
    }
    return { token: subIds[1]!, version: "v2" };
  }
  const legacy = subIds[0] ?? "";
  if (!legacy || legacy.length > 200) {
    throw new AppError("VALIDATION_ERROR", "Shopee Sub ID legacy không hợp lệ.", 400);
  }
  return { token: legacy, version: "legacy" };
}

export function parseShopeeOrdersCsv(content: string): {
  rows: ShopeeOrderRow[];
  quarantined: ShopeeOrderQuarantine[];
  schemaVersion: ShopeeSchema["version"];
} {
  const parsed = parseAndValidateCsv(content);
  const rows: ShopeeOrderRow[] = [];
  const quarantined: ShopeeOrderQuarantine[] = [];
  const naturalKeys = new Set<string>();
  parsed.rows.forEach((rawCells, index) => {
    const rowNumber = index + 2;
    const cells = rawCells.map((value) => value.trim());
    const status = cells[1] ?? "";
    if (status !== parsed.schema.completedStatus) {
      quarantined.push({ rowNumber, code: "NON_PAYABLE_ORDER_STATUS" });
      return;
    }
    const orderId = cells[0];
    const itemId = cells[9];
    const modelId = cells[11];
    if (!orderId || !itemId) {
      throw new AppError("VALIDATION_ERROR", `Dòng ${rowNumber} thiếu natural key.`, 400);
    }
    const externalItemKey = `${itemId}:${modelId || "default"}`;
    const naturalKey = `${orderId}\u0000${externalItemKey}`;
    if (naturalKeys.has(naturalKey)) {
      throw new AppError("VALIDATION_ERROR", `Dòng ${rowNumber} trùng natural key.`, 400);
    }
    naturalKeys.add(naturalKey);
    const itemShopeeCommission = parseVndAmount(cells[24] ?? "", "Item Shopee commission");
    const itemSellerCommission = parseVndAmount(cells[26] ?? "", "Item seller commission");
    const commissionVnd = parseVndAmount(cells[27] ?? "", "Item total commission");
    if (itemShopeeCommission + itemSellerCommission !== commissionVnd) {
      throw new AppError("VALIDATION_ERROR", `Dòng ${rowNumber} không cân tổng hoa hồng.`, 400);
    }
    const subId = resolveClickToken(cells);
    rows.push({
      rowNumber,
      externalOrderId: orderId,
      externalItemKey,
      externalItemId: itemId,
      ...(cells[10] ? { itemName: cells[10] } : {}),
      clickToken: subId.token,
      subIdVersion: subId.version,
      purchasedAt: parseVietnamDate(cells[3] ?? "", "Order Time"),
      deliveredAt: parseVietnamDate(cells[4] ?? "", "Complete Time"),
      quantity: parsePositiveInteger(cells[18] ?? "", "Qty"),
      priceVnd: parseVndAmount(cells[17] ?? "", "Price"),
      commissionVnd,
      rawOrderStatus: status
    });
  });
  return { rows, quarantined, schemaVersion: parsed.schema.version };
}

export async function importShopeeOrders(input: {
  actorUserId: string;
  affiliateAccountId: string;
  filename: string;
  content: string;
  rawBytes?: Uint8Array | undefined;
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
  const rawBody = input.rawBytes ?? input.content;
  const rawSha256 = stableHash(rawBody);
  const parsed = parseShopeeOrdersCsv(input.content);
  const sourceEvidence = await storeRawEvidence({
    provider: ConnectorType.SHOPEE_DIRECT,
    kind: "shopee-orders-csv",
    authority: EvidenceAuthority.AUTHORITATIVE,
    payload: null,
    rawBody,
    contentType: "text/csv; charset=utf-8",
    extension: "csv",
    metadata: {
      filename: input.filename.slice(0, 200),
      importedByUserId: input.actorUserId,
      schemaVersion: parsed.schemaVersion
    },
    schemaVersion: 1
  });
  if (sourceEvidence.sha256 !== rawSha256) {
    throw new AppError("EVIDENCE_INTEGRITY", "Shopee raw evidence hash không khớp.", 503);
  }
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
  const clickTokens = [...new Set(parsed.rows.map((row) => row.clickToken))];
  const matchedClicks = await db.affiliateClick.findMany({
    where: { affiliateAccountId: account.id, clickToken: { in: clickTokens } },
    select: { clickToken: true }
  });
  const matchedClickTokens = new Set(matchedClicks.map((click) => click.clickToken));
  const unmatched = parsed.rows.find((row) => !matchedClickTokens.has(row.clickToken));
  if (unmatched) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Dòng ${unmatched.rowNumber} không khớp click của provider account.`,
      400
    );
  }
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
            schemaVersion: parsed.schemaVersion,
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
            schemaVersion: parsed.schemaVersion,
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

import {
  ConnectorType,
  EvidenceAuthority,
  OrderValidationStatus,
  Prisma,
  ProviderAccountScope,
  SettlementBatchStatus,
  SettlementLineStatus,
  SettlementStatus
} from "@/generated/prisma/client";
import { csvRecords, parseCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { BETA_DAILY_AVAILABLE_LIMIT_VND, parseVndAmount, startOfVietnamDay } from "@/lib/money";
import { storeRawEvidence } from "@/modules/evidence/service";
import { releaseCashback } from "@/modules/ledger/service";

export const SHOPEE_RECONCILIATION_SCHEMA_VERSION = "SHOPEE_RECONCILIATION_DETAIL_V1_48";

// Chỉ được chuyển thành true trong một thay đổi riêng sau khi contract provider được xác minh.
const SHOPEE_RECONCILIATION_CONTRACT_VERIFIED: boolean = false;

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

export type ShopeeReconciliationLine = {
  rowNumber: number;
  externalOrderId: string;
  externalItemKey: string;
  externalItemId: string;
  netCommissionVnd: bigint;
  clickToken: string;
  rawOrderStatus: string;
};

export type ShopeeReconciliationQuarantine = {
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

function validateHeaders(content: string): void {
  const [rawHeaders, ...rawRows] = parseCsv(content);
  if (!rawHeaders) {
    throw new AppError("VALIDATION_ERROR", "CSV Hóa đơn đối soát Shopee không có header.", 400);
  }
  const headers = rawHeaders.map(normalizeHeader);
  if (
    headers.length !== EXPECTED_HEADERS.length ||
    rawRows.some((row) => row.length !== EXPECTED_HEADERS.length) ||
    EXPECTED_HEADERS.some((header, index) => headers[index] !== header)
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `CSV không khớp ${SHOPEE_RECONCILIATION_SCHEMA_VERSION}.`,
      400
    );
  }
}

export function parseShopeeReconciliationCsv(content: string): {
  lines: ShopeeReconciliationLine[];
  quarantined: ShopeeReconciliationQuarantine[];
  totalNetCommissionVnd: bigint;
} {
  validateHeaders(content);
  const records = csvRecords(content);
  if (records.length === 0 || records.length > 20_000) {
    throw new AppError("VALIDATION_ERROR", "CSV phải có từ 1 đến 20.000 dòng.", 400);
  }
  const lines: ShopeeReconciliationLine[] = [];
  const quarantined: ShopeeReconciliationQuarantine[] = [];
  const naturalKeys = new Set<string>();
  let totalNetCommissionVnd = 0n;

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const row = Object.fromEntries(
      Object.entries(record).map(([header, value]) => [normalizeHeader(header), value.trim()])
    );

    if (row["Trạng thái đặt hàng"] !== "Hoàn thành") {
      quarantined.push({ rowNumber, code: "ORDER_NOT_COMPLETED" });
      return;
    }

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

    const netCommStr =
      row["Hoa hồng ròng tiếp thị liên kết(₫)"] || row["Tổng hoa hồng đơn hàng(₫)"] || "0";

    let netCommissionVnd = 0n;
    try {
      netCommissionVnd = parseVndAmount(netCommStr, "Hoa hồng ròng");
    } catch {
      quarantined.push({ rowNumber, code: "INVALID_COMMISSION_AMOUNT" });
      return;
    }

    lines.push({
      rowNumber,
      externalOrderId: orderId,
      externalItemKey,
      externalItemId: itemId,
      netCommissionVnd,
      clickToken: row.Sub_id1 ?? "",
      rawOrderStatus: row["Trạng thái đặt hàng"]
    });

    totalNetCommissionVnd += netCommissionVnd;
  });

  return { lines, quarantined, totalNetCommissionVnd };
}

export async function processShopeeReconciliationInvoice(input: {
  actorUserId: string;
  affiliateAccountId: string;
  filename: string;
  content: string;
  externalReference: string;
  invoiceTotalVnd: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  if (!SHOPEE_RECONCILIATION_CONTRACT_VERIFIED) {
    throw new AppError(
      "CONNECTOR_DISABLED",
      "Shopee Hóa đơn đối soát chưa có provider contract đã xác minh.",
      503
    );
  }

  const account = await db.affiliateAccount.findUnique({
    where: { id: input.affiliateAccountId }
  });

  if (
    !account ||
    !account.enabled ||
    account.scope !== ProviderAccountScope.PLATFORM_MANAGED ||
    account.connectorType !== ConnectorType.SHOPEE_DIRECT
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Hóa đơn đối soát Shopee chỉ áp dụng cho platform-managed Shopee account.",
      400
    );
  }

  const parsedInvoiceTotal = parseVndAmount(input.invoiceTotalVnd, "invoiceTotalVnd");
  const parsed = parseShopeeReconciliationCsv(input.content);

  if (parsed.quarantined.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `File có ${parsed.quarantined.length} dòng không hợp lệ/cần quarantine. Không thể đóng đối soát.`,
      400
    );
  }

  if (parsed.totalNetCommissionVnd !== parsedInvoiceTotal) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Tổng các dòng đối soát (${parsed.totalNetCommissionVnd}) không khớp tổng hóa đơn (${parsedInvoiceTotal}).`,
      400
    );
  }

  const raw = await storeRawEvidence({
    provider: ConnectorType.SHOPEE_DIRECT,
    kind: "shopee-reconciliation-invoice",
    authority: EvidenceAuthority.AUTHORITATIVE,
    externalRef: input.externalReference,
    payload: null,
    rawBody: input.content,
    contentType: "text/csv; charset=utf-8",
    extension: "csv",
    metadata: {
      filename: input.filename.slice(0, 200),
      externalReference: input.externalReference,
      invoiceTotalVnd: input.invoiceTotalVnd,
      lineCount: parsed.lines.length,
      importedByUserId: input.actorUserId,
      schemaVersion: SHOPEE_RECONCILIATION_SCHEMA_VERSION
    },
    schemaVersion: 1
  });

  return await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`;

      const replay = await tx.settlementBatch.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (replay) {
        if (replay.requestHash !== input.requestHash) {
          throw new AppError("CONFLICT", "Idempotency-Key đã được dùng với dữ liệu khác.", 409);
        }
        return replay;
      }

      const lockedAccount = await tx.affiliateAccount.findUniqueOrThrow({
        where: { id: account.id }
      });
      await tx.$queryRaw`SELECT id FROM "AffiliateAccount" WHERE id = ${lockedAccount.id} FOR UPDATE`;

      const matches = [];
      for (const line of parsed.lines) {
        const identity = await tx.externalConversionIdentity.findUnique({
          where: {
            source_affiliateAccountId_externalOrderId_externalItemKey: {
              source: ConnectorType.SHOPEE_DIRECT,
              affiliateAccountId: account.id,
              externalOrderId: line.externalOrderId,
              externalItemKey: line.externalItemKey
            }
          },
          include: { conversion: true }
        });

        if (!identity) {
          throw new AppError(
            "VALIDATION_ERROR",
            `Dòng đối soát đơn hàng ${line.externalOrderId} (${line.externalItemKey}) không tồn tại trong hệ thống.`,
            400
          );
        }
        matches.push({ line, conversion: identity.conversion });
      }

      const conversionIds = matches.map(({ conversion }) => conversion.id).sort();
      await tx.$queryRaw`
        SELECT id FROM "Conversion"
        WHERE id IN (${Prisma.join(conversionIds)})
        ORDER BY id
        FOR UPDATE
      `;

      const releasedPerUser = new Map<string, bigint>();
      for (const { conversion } of matches) {
        const current = await tx.conversion.findUniqueOrThrow({
          where: { id: conversion.id }
        });

        if (
          current.tenantId ||
          !current.userId ||
          current.orderValidationStatus !== OrderValidationStatus.VALIDATED ||
          current.settlementStatus !== SettlementStatus.UNBILLED
        ) {
          throw new AppError(
            "VALIDATION_ERROR",
            `Conversion ${current.id} chưa đủ điều kiện đối soát (cần VALIDATED & UNBILLED).`,
            400
          );
        }

        releasedPerUser.set(
          current.userId,
          (releasedPerUser.get(current.userId) ?? 0n) + current.cashbackVnd
        );
      }

      for (const [userId, amountVnd] of releasedPerUser) {
        const dailyReleased = await tx.conversion.aggregate({
          where: {
            userId,
            availableAt: { gte: startOfVietnamDay() }
          },
          _sum: { cashbackVnd: true }
        });
        if ((dailyReleased._sum.cashbackVnd ?? 0n) + amountVnd > BETA_DAILY_AVAILABLE_LIMIT_VND) {
          throw new AppError(
            "PAYOUT_LIMIT",
            "Hóa đơn đối soát vượt giới hạn cashback khả dụng trong ngày.",
            409
          );
        }
      }

      const evidence = await tx.settlementEvidence.create({
        data: {
          affiliateAccountId: account.id,
          rawEvidenceId: raw.id,
          fileSha256: raw.sha256,
          provider: ConnectorType.SHOPEE_DIRECT,
          kind: "SHOPEE_RECONCILIATION_INVOICE",
          externalReference: input.externalReference,
          importedByUserId: input.actorUserId,
          metadata: {
            accountFingerprint: account.fingerprint,
            lineCount: parsed.lines.length,
            invoiceTotalVnd: input.invoiceTotalVnd
          }
        }
      });

      const now = new Date();
      const batch = await tx.settlementBatch.create({
        data: {
          affiliateAccountId: account.id,
          evidenceId: evidence.id,
          provider: ConnectorType.SHOPEE_DIRECT,
          externalReference: input.externalReference,
          status: SettlementBatchStatus.CLOSED,
          totalAmountVnd: parsedInvoiceTotal,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          createdByUserId: input.actorUserId,
          closedAt: now,
          lines: {
            create: matches.map(({ line, conversion }) => ({
              conversionId: conversion.id,
              externalOrderId: line.externalOrderId,
              externalItemKey: line.externalItemKey,
              amountVnd: line.netCommissionVnd,
              status: SettlementLineStatus.MATCHED
            }))
          }
        }
      });

      for (const { conversion } of matches) {
        const current = await tx.conversion.findUniqueOrThrow({
          where: { id: conversion.id }
        });
        if (current.cashbackVnd > 0n) {
          await releaseCashback(tx, {
            userId: current.userId!,
            conversionId: current.id,
            amountVnd: current.cashbackVnd
          });
        }
        await tx.conversion.update({
          where: { id: current.id },
          data: {
            settlementStatus: SettlementStatus.RELEASED,
            availableAt: now
          }
        });
        await tx.settlementLine.update({
          where: { conversionId: current.id },
          data: {
            status: SettlementLineStatus.RELEASED,
            releasedAt: now
          }
        });
      }

      await tx.settlementBatch.update({
        where: { id: batch.id },
        data: {
          status: SettlementBatchStatus.RELEASED,
          releasedAt: now
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: "shopee_reconciliation_invoice.released",
          entityType: "SettlementBatch",
          entityId: batch.id,
          after: {
            provider: ConnectorType.SHOPEE_DIRECT,
            accountFingerprint: account.fingerprint,
            externalReference: input.externalReference,
            invoiceTotalVnd: input.invoiceTotalVnd,
            lineCount: parsed.lines.length,
            evidenceSha256: raw.sha256
          }
        }
      });

      return tx.settlementBatch.findUniqueOrThrow({ where: { id: batch.id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

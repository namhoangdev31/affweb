import { z } from "zod";
import {
  AffiliateAttributionMode,
  OrderValidationStatus,
  Prisma,
  SettlementStatus
} from "@/generated/prisma/client";
import { requireApiRecentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import {
  assertTrustedOrigin,
  readJson,
  requestId,
  requestPayloadHash,
  requireIdempotencyKey
} from "@/lib/request";

export const runtime = "nodejs";

const inputSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  paymentReference: z.string().trim().min(1).max(200).optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const requestIdentifier = await requestId();
  try {
    assertTrustedOrigin(request);
    const actor = await requireApiRecentUser();
    const body = inputSchema.parse(await readJson(request));
    const idempotencyKey = requireIdempotencyKey(request);
    const requestHash = requestPayloadHash(body);
    const { id } = await context.params;
    const namespace = `tenant.external-payment:${id}`;
    const result = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${namespace + idempotencyKey}))`;
        const receipt = await tx.idempotencyRecord.findUnique({
          where: {
            namespace_idempotencyKey: {
              namespace,
              idempotencyKey
            }
          }
        });
        if (receipt) {
          if (receipt.requestHash !== requestHash) {
            throw new AppError("CONFLICT", "Idempotency-Key đã được dùng với dữ liệu khác.", 409);
          }
          return receipt.responseBody;
        }
        await tx.$queryRaw`SELECT id FROM "Conversion" WHERE id = ${id} FOR UPDATE`;
        const conversion = await tx.conversion.findFirst({
          where: {
            id,
            tenant: { ownerUserId: actor.id }
          },
          include: {
            click: { select: { attributionMode: true } }
          }
        });
        if (!conversion?.tenantId) {
          throw new AppError("FORBIDDEN", "Bạn không quản lý conversion này.", 403);
        }
        if (
          conversion.orderValidationStatus !== OrderValidationStatus.VALIDATED ||
          conversion.status !== "VALIDATED"
        ) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Chỉ có thể xác nhận chi trả cho conversion đã validated.",
            400
          );
        }
        if (
          conversion.click?.attributionMode === AffiliateAttributionMode.TENANT_CHANNEL ||
          conversion.cashbackVnd <= 0n
        ) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Conversion cấp tenant không có nghĩa vụ chi member.",
            400
          );
        }
        const paidAt = conversion.tenantPaidAt ?? new Date();
        if (!conversion.tenantPaidAt) {
          await tx.conversion.update({
            where: { id: conversion.id },
            data: {
              tenantPaidAt: paidAt,
              settlementStatus: SettlementStatus.RELEASED
            }
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: "tenant.conversion.external_payment",
              entityType: "Conversion",
              entityId: conversion.id,
              requestId: requestIdentifier,
              after: {
                tenantId: conversion.tenantId,
                cashbackVnd: conversion.cashbackVnd.toString(),
                paidAt: paidAt.toISOString(),
                paymentReference: body.paymentReference ?? null,
                reason: body.reason,
                settlementMode: "TENANT_OWNER_EXTERNAL"
              }
            }
          });
        }
        const responseBody: Prisma.InputJsonValue = {
          conversionId: conversion.id,
          paidAt: paidAt.toISOString(),
          duplicate: conversion.tenantPaidAt !== null
        };
        await tx.idempotencyRecord.create({
          data: {
            namespace,
            idempotencyKey,
            requestHash,
            responseStatus: 200,
            responseBody,
            expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1_000)
          }
        });
        return responseBody;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return Response.json(
      { data: result },
      {
        headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestIdentifier }
      }
    );
  } catch (error) {
    return errorResponse(error, requestIdentifier);
  }
}

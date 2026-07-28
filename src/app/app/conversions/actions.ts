"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export async function markTenantConversionPaidAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversionId = z.string().cuid().parse(formData.get("conversionId"));
  const now = new Date();

  await db.$transaction(
    async (tx) => {
      const conversion = await tx.conversion.findFirst({
        where: {
          id: conversionId,
          tenant: { ownerUserId: user.id }
        },
        select: {
          id: true,
          tenantId: true,
          status: true,
          orderValidationStatus: true,
          cashbackVnd: true,
          tenantPaidAt: true,
          click: { select: { attributionMode: true } }
        }
      });
      if (!conversion?.tenantId) {
        throw new AppError("FORBIDDEN", "Bạn không quản lý đơn hàng này.", 403);
      }
      if (conversion.status !== "VALIDATED" || conversion.orderValidationStatus !== "VALIDATED") {
        throw new AppError(
          "VALIDATION_ERROR",
          "Chỉ có thể xác nhận chi trả cho đơn đã được duyệt.",
          400
        );
      }
      if (
        conversion.click?.attributionMode === "TENANT_CHANNEL" ||
        conversion.cashbackVnd <= 0n ||
        conversion.tenantPaidAt
      ) {
        return;
      }

      const updated = await tx.conversion.updateMany({
        where: {
          id: conversion.id,
          tenantPaidAt: null,
          status: "VALIDATED",
          orderValidationStatus: "VALIDATED"
        },
        data: { tenantPaidAt: now, settlementStatus: "RELEASED" }
      });
      if (updated.count !== 1) return;

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "tenant.conversion.marked_paid",
          entityType: "Conversion",
          entityId: conversion.id,
          after: {
            tenantId: conversion.tenantId,
            cashbackVnd: conversion.cashbackVnd.toString(),
            paidAt: now.toISOString(),
            settlementMode: "TENANT_ADMIN_EXTERNAL"
          }
        }
      });
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/app/conversions");
}

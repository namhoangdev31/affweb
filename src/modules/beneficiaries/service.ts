import "server-only";

import { db } from "@/lib/db";
import { encryptSensitiveValue } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";

export async function saveBeneficiary(input: {
  userId: string;
  bankBin: string;
  accountNumber: string;
  accountName: string;
  ipHash?: string;
}) {
  if (!/^\d{6}$/.test(input.bankBin)) {
    throw new AppError("VALIDATION_ERROR", "Mã BIN ngân hàng không hợp lệ.", 400);
  }
  if (!/^\d{6,20}$/.test(input.accountNumber)) {
    throw new AppError("VALIDATION_ERROR", "Số tài khoản không hợp lệ.", 400);
  }
  const normalizedName = input.accountName.trim().toUpperCase();
  if (normalizedName.length < 3 || normalizedName.length > 120) {
    throw new AppError("VALIDATION_ERROR", "Tên chủ tài khoản không hợp lệ.", 400);
  }
  const last4 = input.accountNumber.slice(-4);
  return db.$transaction(async (tx) => {
    const previous = await tx.bankBeneficiary.findFirst({
      where: { userId: input.userId, active: true },
      orderBy: { createdAt: "desc" }
    });
    await tx.bankBeneficiary.updateMany({
      where: { userId: input.userId, active: true },
      data: { active: false, status: "ARCHIVED" }
    });
    const beneficiary = await tx.bankBeneficiary.create({
      data: {
        userId: input.userId,
        bankBin: input.bankBin,
        accountNumberCipher: encryptSensitiveValue(input.accountNumber),
        accountNameCipher: encryptSensitiveValue(normalizedName),
        accountLast4: last4,
        encryptionKeyVersion: 1,
        status: "VERIFIED",
        verifiedAt: new Date()
      }
    });
    const holdUntil = new Date(
      Date.now() + loadServerEnv().BENEFICIARY_HOLD_HOURS * 60 * 60 * 1000
    );
    await tx.beneficiaryChange.create({
      data: {
        userId: input.userId,
        beneficiaryId: beneficiary.id,
        previousLast4: previous?.accountLast4 ?? null,
        newLast4: last4,
        holdUntil,
        ipHash: input.ipHash ?? null
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        action: "beneficiary.changed",
        entityType: "BankBeneficiary",
        entityId: beneficiary.id,
        after: { bankBin: input.bankBin, accountLast4: last4, holdUntil: holdUntil.toISOString() }
      }
    });
    return { id: beneficiary.id, bankBin: input.bankBin, accountLast4: last4, holdUntil };
  });
}

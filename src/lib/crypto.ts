import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  const encoded = loadServerEnv().BANK_DATA_ENCRYPTION_KEY_V1;
  if (!encoded) {
    throw new AppError("INTERNAL_ERROR", "Bank encryption is not configured.", 503);
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new AppError(
      "INTERNAL_ERROR",
      "BANK_DATA_ENCRYPTION_KEY_V1 must decode to 32 bytes.",
      503
    );
  }
  return key;
}

export function encryptSensitiveValue(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSensitiveValue(payload: string): string {
  const [version, ivPart, tagPart, ciphertextPart] = payload.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart) {
    throw new AppError("VALIDATION_ERROR", "Invalid encrypted value.", 400);
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

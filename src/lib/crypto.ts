import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
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

function zaloEncryptionKey(): Buffer {
  const encoded = loadServerEnv().ZALO_DATA_ENCRYPTION_KEY_V1;
  if (!encoded) {
    throw new AppError("INTERNAL_ERROR", "Zalo data encryption is not configured.", 503);
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new AppError(
      "INTERNAL_ERROR",
      "ZALO_DATA_ENCRYPTION_KEY_V1 must decode to 32 bytes.",
      503
    );
  }
  return key;
}

function providerCredentialEncryptionKey(): Buffer {
  const encoded = loadServerEnv().PROVIDER_CREDENTIAL_ENCRYPTION_KEY_V1;
  if (!encoded) {
    throw new AppError("INTERNAL_ERROR", "Provider credential encryption is not configured.", 503);
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new AppError(
      "INTERNAL_ERROR",
      "PROVIDER_CREDENTIAL_ENCRYPTION_KEY_V1 must decode to 32 bytes.",
      503
    );
  }
  return key;
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptWithKey(payload: string, key: Buffer): string {
  const [version, ivPart, tagPart, ciphertextPart] = payload.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart) {
    throw new AppError("VALIDATION_ERROR", "Invalid encrypted value.", 400);
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function encryptSensitiveValue(plaintext: string): string {
  return encryptWithKey(plaintext, encryptionKey());
}

export function decryptSensitiveValue(payload: string): string {
  return decryptWithKey(payload, encryptionKey());
}

export function stableHash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function encryptZaloIdentifier(value: string): Buffer {
  return Buffer.from(encryptWithKey(value, zaloEncryptionKey()), "utf8");
}

export function decryptZaloIdentifier(value: Uint8Array): string {
  return decryptWithKey(Buffer.from(value).toString("utf8"), zaloEncryptionKey());
}

export function hashZaloIdentifier(value: string): string {
  return createHmac("sha256", zaloEncryptionKey()).update(value).digest("hex");
}

export function encryptProviderCredential(value: string): string {
  return encryptWithKey(value, providerCredentialEncryptionKey());
}

export function decryptProviderCredential(value: string): string {
  return decryptWithKey(value, providerCredentialEncryptionKey());
}

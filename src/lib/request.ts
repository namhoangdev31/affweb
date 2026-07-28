import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";

export async function requestId(): Promise<string> {
  try {
    return (await headers()).get("x-request-id") ?? crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}

export function assertTrustedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  try {
    const originHost = new URL(origin).host;
    const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const expectedHost = new URL(loadServerEnv().APP_BASE_URL).host;

    if (
      (requestHost && originHost === requestHost) ||
      originHost === expectedHost ||
      (loadServerEnv().NODE_ENV !== "production" &&
        (originHost === "localhost" ||
          originHost.startsWith("localhost:") ||
          originHost === "127.0.0.1" ||
          originHost.startsWith("127.0.0.1:")))
    ) {
      return;
    }
  } catch {
    // If origin URL parsing fails, fall through to error
  }

  throw new AppError("FORBIDDEN", "Untrusted request origin.", 403);
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length < 16 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new AppError("VALIDATION_ERROR", "Idempotency-Key phải dài 16-128 ký tự an toàn.", 400);
  }
  return key;
}

export function requestPayloadHash(value: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item))
    )
    .digest("hex");
}

export async function readJson<T>(request: Request, maxBytes = 32_768): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new AppError("VALIDATION_ERROR", "Request body is too large.", 413);
  }
  return (await request.json()) as T;
}

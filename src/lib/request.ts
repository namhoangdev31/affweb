import { headers } from "next/headers";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";

export async function requestId(): Promise<string> {
  return (await headers()).get("x-request-id") ?? crypto.randomUUID();
}

export function assertTrustedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(loadServerEnv().APP_BASE_URL).origin;
  if (origin !== expected) {
    throw new AppError("FORBIDDEN", "Untrusted request origin.", 403);
  }
}

export async function readJson<T>(request: Request, maxBytes = 32_768): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new AppError("VALIDATION_ERROR", "Request body is too large.", 413);
  }
  return (await request.json()) as T;
}

import { headers } from "next/headers";
import { AppError } from "@/lib/errors";
import { loadServerEnv } from "@/lib/env";

export async function requestId(): Promise<string> {
  return (await headers()).get("x-request-id") ?? crypto.randomUUID();
}

export function assertTrustedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  try {
    const originHost = new URL(origin).host;
    const requestHost =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
    const expectedHost = new URL(loadServerEnv().APP_BASE_URL).host;

    if (
      (requestHost && originHost === requestHost) ||
      originHost === expectedHost ||
      originHost.endsWith(".vercel.app") ||
      originHost.includes("localhost") ||
      originHost.includes("127.0.0.1")
    ) {
      return;
    }
  } catch {
    // If origin URL parsing fails, fall through to error
  }

  throw new AppError("FORBIDDEN", "Untrusted request origin.", 403);
}

export async function readJson<T>(request: Request, maxBytes = 32_768): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new AppError("VALIDATION_ERROR", "Request body is too large.", 413);
  }
  return (await request.json()) as T;
}

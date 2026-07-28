import "server-only";

import { AppError } from "@/lib/errors";
import { readLosslessJsonResponse } from "@/lib/lossless-json";

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1_000, 10_000);
  }
  return attempt === 0 ? 500 : 1_500;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function requestProviderJson(input: {
  provider: string;
  url: URL;
  init?: RequestInit;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxAttempts?: number;
}): Promise<unknown> {
  const maxAttempts = Math.min(Math.max(input.maxAttempts ?? 2, 1), 3);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(input.url, {
        ...input.init,
        cache: "no-store",
        signal: AbortSignal.timeout(input.timeoutMs ?? 20_000)
      });
    } catch {
      if (attempt + 1 < maxAttempts) {
        await delay(attempt === 0 ? 500 : 1_500);
        continue;
      }
      throw new AppError(
        "CONNECTOR_UNAVAILABLE",
        `${input.provider} không phản hồi trong thời gian cho phép.`,
        503
      );
    }
    if (response.ok) {
      return readLosslessJsonResponse(response, input.maxResponseBytes ?? 2_097_152);
    }
    if (RETRYABLE_STATUS.has(response.status) && attempt + 1 < maxAttempts) {
      await response.body?.cancel();
      await delay(retryDelayMs(response, attempt));
      continue;
    }
    await response.body?.cancel();
    throw new AppError(
      "CONNECTOR_UNAVAILABLE",
      `${input.provider} trả về HTTP ${response.status}.`,
      response.status === 401 || response.status === 403 || response.status === 429 ? 503 : 502
    );
  }
  throw new AppError("CONNECTOR_UNAVAILABLE", `${input.provider} tạm thời không khả dụng.`, 503);
}

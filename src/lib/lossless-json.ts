import { parse } from "lossless-json";
import { AppError } from "@/lib/errors";

export function parseLosslessJson(input: string, maxBytes = 1_048_576): unknown {
  if (Buffer.byteLength(input) > maxBytes) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Provider response is too large.", 503);
  }
  try {
    return parse(input, undefined, {
      parseNumber: (value) => value
    });
  } catch {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Provider returned malformed JSON.", 503);
  }
}

export async function readLosslessJsonResponse(
  response: Response,
  maxBytes = 1_048_576
): Promise<unknown> {
  return parseLosslessJson(await response.text(), maxBytes);
}

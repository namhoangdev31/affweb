import "server-only";

import { Receiver } from "@upstash/qstash";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export async function verifyQStashRequest(request: Request, body: string): Promise<void> {
  const env = loadServerEnv();
  const signature = request.headers.get("upstash-signature");
  if (!env.QSTASH_CURRENT_SIGNING_KEY || !env.QSTASH_NEXT_SIGNING_KEY || !signature) {
    throw new AppError("AUTH_REQUIRED", "QStash signature is required.", 401);
  }
  const receiver = new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY
  });
  const valid = await receiver.verify({
    signature,
    body,
    url: request.url
  });
  if (!valid) throw new AppError("AUTH_REQUIRED", "Invalid QStash signature.", 401);
}

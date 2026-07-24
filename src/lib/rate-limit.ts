import "server-only";

import { Redis } from "@upstash/redis";
import { loadServerEnv } from "@/lib/env";

type LimitResult = { allowed: boolean; remaining: number; resetAt: number };

const localWindows = new Map<string, { count: number; resetAt: number }>();

function localLimit(key: string, limit: number, windowSeconds: number): LimitResult {
  const now = Date.now();
  const current = localWindows.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowSeconds * 1000;
    localWindows.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  current.count += 1;
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt
  };
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<LimitResult> {
  const env = loadServerEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return localLimit(key, limit, windowSeconds);
  }

  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN
  });
  const bucket = `rate:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const count = await redis.incr(bucket);
  if (count === 1) await redis.expire(bucket, windowSeconds);
  const resetAt = Date.now() + windowSeconds * 1000;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}

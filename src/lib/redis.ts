import "server-only";
import { Redis } from "@upstash/redis";
import { loadServerEnv } from "@/lib/env";

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const env = loadServerEnv();
  const url = env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  redisClient = new Redis({ url, token });
  return redisClient;
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedis();
    if (!client) {
      throw new Error("Upstash Redis is not configured. Please check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    }
    const val = (client as unknown as Record<string, unknown>)[prop as string];
    return typeof val === "function" ? val.bind(client) : val;
  }
});

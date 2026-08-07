import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { loadServerEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const env = loadServerEnv();
const rawConnectionString =
  process.env.NEXT_JS_DB_PRISMA_PRISMA_DATABASE_URL ??
  process.env.NEXT_JS_DB_PRISMA_POSTGRES_URL ??
  env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/affweb";

const connectionString = rawConnectionString.includes("sslmode=require")
  ? rawConnectionString.replace(/sslmode=require/g, "sslmode=verify-full")
  : rawConnectionString;

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString })
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

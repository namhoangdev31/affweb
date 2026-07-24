import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { loadServerEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const connectionString =
  loadServerEnv().DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/affweb";

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString })
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

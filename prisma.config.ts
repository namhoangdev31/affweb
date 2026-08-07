import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url:
      process.env.NEXT_JS_DB_PRISMA_PRISMA_DATABASE_URL ??
      process.env.NEXT_JS_DB_PRISMA_POSTGRES_URL ??
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/affweb"
  }
});

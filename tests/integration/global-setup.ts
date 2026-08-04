import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { execFileSync } from "node:child_process";
import { requireDisposableTestDatabase } from "./database-guard";

export default function setup(): void {
  const testDatabaseUrl = requireDisposableTestDatabase();

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      DIRECT_URL: testDatabaseUrl,
      DATABASE_URL_UNPOOLED: testDatabaseUrl
    },
    stdio: "inherit"
  });
}

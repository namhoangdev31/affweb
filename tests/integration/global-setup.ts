import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { execFileSync } from "node:child_process";
import { requireDisposableTestDatabasePair } from "./database-guard";

export default function setup(): void {
  const { pooledUrl, directUrl } = requireDisposableTestDatabasePair();

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: pooledUrl,
      DIRECT_URL: directUrl,
      DATABASE_URL_UNPOOLED: directUrl
    },
    stdio: "inherit"
  });
}

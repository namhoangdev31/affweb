import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { execFileSync } from "node:child_process";
import { requireDisposableTestDatabase } from "./database-guard";

export default function setup(): void {
  const testDatabaseUrl = requireDisposableTestDatabase();

  execFileSync("pnpm", ["exec", "prisma", "db", "execute", "--stdin"], {
    cwd: process.cwd(),
    input: `
      CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'ledger rows are append-only';
      END;
      $$;

      DROP TRIGGER IF EXISTS "LedgerTransaction_append_only" ON "LedgerTransaction";
      CREATE TRIGGER "LedgerTransaction_append_only"
      BEFORE UPDATE OR DELETE ON "LedgerTransaction"
      FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

      DROP TRIGGER IF EXISTS "LedgerEntry_append_only" ON "LedgerEntry";
      CREATE TRIGGER "LedgerEntry_append_only"
      BEFORE UPDATE OR DELETE ON "LedgerEntry"
      FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
    `,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      DIRECT_URL: testDatabaseUrl,
      DATABASE_URL_UNPOOLED: testDatabaseUrl
    },
    stdio: ["pipe", "inherit", "inherit"]
  });
}

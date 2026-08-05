import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for read-only inventory.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const [coreByStatus, tenantByState, conversionMismatches, terminalJournalMismatches] =
  await Promise.all([
    prisma.payoutTicket.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amountVnd: true }
    }),
    prisma.tenantPayout.groupBy({
      by: ["approvalStatus", "settlementStatus", "legacyResolutionStatus"],
      _count: { _all: true },
      _sum: { amountVnd: true }
    }),
    prisma.conversion.findMany({
      where: {
        tenantPaidAt: { not: null },
        OR: [
          { tenantCashbackObligation: null },
          { tenantCashbackObligation: { status: { not: "PAID" } } }
        ]
      },
      select: { id: true, tenantId: true, tenantPaidAt: true },
      take: 500,
      orderBy: { id: "asc" }
    }),
    prisma.tenantPayout.findMany({
      where: {
        settlementStatus: { in: ["PAID", "FAILED"] },
        terminalJournalId: null
      },
      select: { id: true, tenantId: true, settlementStatus: true },
      take: 500,
      orderBy: { id: "asc" }
    })
  ]);

const bigintJson = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;
process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      truncatedAt: 500,
      coreByStatus,
      tenantByState,
      conversionMismatches,
      terminalJournalMismatches
    },
    bigintJson,
    2
  )}\n`
);
await prisma.$disconnect();

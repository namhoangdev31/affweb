import "server-only";

import {
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  type Prisma
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { isBalancedJournal } from "@/modules/ledger/invariants";

type Tx = Prisma.TransactionClient;

type JournalLine = {
  accountCode: string;
  accountName: string;
  accountKind: LedgerAccountKind;
  userId?: string;
  direction: LedgerDirection;
  amountVnd: bigint;
};

function assertBalanced(lines: readonly JournalLine[]): void {
  if (!isBalancedJournal(lines)) {
    throw new AppError("LEDGER_IMBALANCE", "Journal entry is not balanced.", 500);
  }
}

async function ensureAccount(tx: Tx, line: JournalLine): Promise<string> {
  const existing = await tx.ledgerAccount.findUnique({
    where: { code: line.accountCode }
  });
  if (existing) return existing.id;
  const account = await tx.ledgerAccount.upsert({
    where: { code: line.accountCode },
    create: {
      code: line.accountCode,
      name: line.accountName,
      kind: line.accountKind,
      userId: line.userId ?? null
    },
    update: {}
  });
  return account.id;
}

export async function postJournal(
  tx: Tx,
  input: {
    type: LedgerTransactionType;
    idempotencyKey: string;
    description: string;
    reference?: string;
    createdById?: string;
    metadata?: Prisma.InputJsonValue;
    lines: JournalLine[];
  }
): Promise<{ id: string; created: boolean }> {
  assertBalanced(input.lines);
  const existing = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });
  if (existing) return { id: existing.id, created: false };

  const accountIds = new Map<string, string>();
  for (const line of input.lines) {
    accountIds.set(line.accountCode, await ensureAccount(tx, line));
  }
  const transaction = await tx.ledgerTransaction.create({
    data: {
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      reference: input.reference ?? null,
      createdById: input.createdById ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      entries: {
        create: input.lines.map((line) => ({
          accountId: accountIds.get(line.accountCode)!,
          direction: line.direction,
          amountVnd: line.amountVnd
        }))
      }
    }
  });
  return { id: transaction.id, created: true };
}

export async function postPendingCashback(
  tx: Tx,
  input: {
    userId: string;
    conversionId: string;
    grossCommissionVnd: bigint;
    cashbackVnd: bigint;
  }
): Promise<void> {
  const platformRevenue = input.grossCommissionVnd - input.cashbackVnd;
  const lines: JournalLine[] = [
    {
      accountCode: "asset:provider-receivable",
      accountName: "Provider receivable",
      accountKind: LedgerAccountKind.ASSET,
      direction: LedgerDirection.DEBIT,
      amountVnd: input.grossCommissionVnd
    },
    {
      accountCode: `liability:user:${input.userId}:pending`,
      accountName: "User pending cashback",
      accountKind: LedgerAccountKind.LIABILITY,
      userId: input.userId,
      direction: LedgerDirection.CREDIT,
      amountVnd: input.cashbackVnd
    }
  ];
  if (platformRevenue > 0n) {
    lines.push({
      accountCode: "revenue:platform",
      accountName: "Platform revenue",
      accountKind: LedgerAccountKind.REVENUE,
      direction: LedgerDirection.CREDIT,
      amountVnd: platformRevenue
    });
  }
  const journal = await postJournal(tx, {
    type: LedgerTransactionType.COMMISSION_PENDING,
    idempotencyKey: `conversion:${input.conversionId}:pending`,
    description: "Ghi nhận hoa hồng và cashback chờ duyệt.",
    reference: input.conversionId,
    lines
  });
  if (!journal.created) return;
  await tx.walletProjection.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, pendingVnd: input.cashbackVnd },
    update: { pendingVnd: { increment: input.cashbackVnd }, version: { increment: 1 } }
  });
}

export async function releaseCashback(
  tx: Tx,
  input: { userId: string; conversionId: string; amountVnd: bigint }
): Promise<void> {
  const journal = await postJournal(tx, {
    type: LedgerTransactionType.CASHBACK_RELEASE,
    idempotencyKey: `conversion:${input.conversionId}:release`,
    description: "Chuyển cashback từ chờ duyệt sang khả dụng.",
    reference: input.conversionId,
    lines: [
      {
        accountCode: `liability:user:${input.userId}:pending`,
        accountName: "User pending cashback",
        accountKind: LedgerAccountKind.LIABILITY,
        userId: input.userId,
        direction: LedgerDirection.DEBIT,
        amountVnd: input.amountVnd
      },
      {
        accountCode: `liability:user:${input.userId}:available`,
        accountName: "User available cashback",
        accountKind: LedgerAccountKind.LIABILITY,
        userId: input.userId,
        direction: LedgerDirection.CREDIT,
        amountVnd: input.amountVnd
      }
    ]
  });
  if (!journal.created) return;
  await tx.walletProjection.update({
    where: { userId: input.userId },
    data: {
      pendingVnd: { decrement: input.amountVnd },
      availableVnd: { increment: input.amountVnd },
      version: { increment: 1 }
    }
  });
}

export async function verifyLedgerBalance(): Promise<{
  balanced: boolean;
  imbalancedTransactionIds: string[];
}> {
  const rows = await db.$queryRaw<Array<{ transaction_id: string }>>`
    SELECT "transactionId" AS transaction_id
    FROM "LedgerEntry"
    GROUP BY "transactionId"
    HAVING SUM(CASE WHEN direction = 'DEBIT' THEN "amountVnd" ELSE -"amountVnd" END) <> 0
  `;
  return {
    balanced: rows.length === 0,
    imbalancedTransactionIds: rows.map((row) => row.transaction_id)
  };
}

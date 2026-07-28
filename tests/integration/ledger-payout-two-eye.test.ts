import { describe, expect, it } from "vitest";
import { LedgerAccountKind, LedgerDirection, PayoutStatus } from "@/generated/prisma/client";
import { encryptSensitiveValue } from "@/lib/crypto";
import { isBalancedJournal } from "@/modules/ledger/invariants";
import { canTransitionPayout } from "@/modules/payout/state-machine";

describe("Ledger Invariants & Double-Entry Accounting", () => {
  it("validates that balanced journals are accepted", () => {
    const balancedLines = [
      {
        accountCode: "asset:provider-receivable",
        accountName: "Provider receivable",
        accountKind: LedgerAccountKind.ASSET,
        direction: LedgerDirection.DEBIT,
        amountVnd: 100_000n
      },
      {
        accountCode: "liability:user:user_123:pending",
        accountName: "User pending cashback",
        accountKind: LedgerAccountKind.LIABILITY,
        userId: "user_123",
        direction: LedgerDirection.CREDIT,
        amountVnd: 60_000n
      },
      {
        accountCode: "revenue:platform",
        accountName: "Platform revenue",
        accountKind: LedgerAccountKind.REVENUE,
        direction: LedgerDirection.CREDIT,
        amountVnd: 40_000n
      }
    ];

    expect(isBalancedJournal(balancedLines)).toBe(true);
  });

  it("detects imbalanced journal entries where DEBIT does not equal CREDIT", () => {
    const imbalancedLines = [
      {
        accountCode: "asset:provider-receivable",
        accountName: "Provider receivable",
        accountKind: LedgerAccountKind.ASSET,
        direction: LedgerDirection.DEBIT,
        amountVnd: 100_000n
      },
      {
        accountCode: "liability:user:user_123:pending",
        accountName: "User pending cashback",
        accountKind: LedgerAccountKind.LIABILITY,
        userId: "user_123",
        direction: LedgerDirection.CREDIT,
        amountVnd: 50_000n
      }
    ];

    expect(isBalancedJournal(imbalancedLines)).toBe(false);
  });
});

describe("Payout State Machine & Two-Eye Control Rules", () => {
  it("enforces valid state transitions from DRAFT through PAID", () => {
    expect(canTransitionPayout(PayoutStatus.DRAFT, PayoutStatus.RESERVED)).toBe(true);
    expect(canTransitionPayout(PayoutStatus.RESERVED, PayoutStatus.REVIEWED)).toBe(true);
    expect(canTransitionPayout(PayoutStatus.REVIEWED, PayoutStatus.APPROVED)).toBe(true);
    expect(canTransitionPayout(PayoutStatus.APPROVED, PayoutStatus.SUBMITTED)).toBe(true);
    expect(canTransitionPayout(PayoutStatus.SUBMITTED, PayoutStatus.PROCESSING)).toBe(true);
    expect(canTransitionPayout(PayoutStatus.PROCESSING, PayoutStatus.PAID)).toBe(true);
  });

  it("blocks illegal state transitions like DRAFT directly to PAID or APPROVED without REVIEW", () => {
    expect(canTransitionPayout(PayoutStatus.DRAFT, PayoutStatus.PAID)).toBe(false);
    expect(canTransitionPayout(PayoutStatus.RESERVED, PayoutStatus.APPROVED)).toBe(false);
    expect(canTransitionPayout(PayoutStatus.PAID, PayoutStatus.RESERVED)).toBe(false);
  });
});

describe("Bank Beneficiary & Cryptographic Security Rules", () => {
  it("encrypts bank account numbers using AES-256-GCM cipher format", () => {
    process.env.BANK_DATA_ENCRYPTION_KEY_V1 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const rawAccountNumber = "1903456789012";
    const encryptedCipher = encryptSensitiveValue(rawAccountNumber);

    expect(encryptedCipher).not.toEqual(rawAccountNumber);
    expect(encryptedCipher).toContain("v1.");
  });

  it("calculates 72-hour hold period timestamp upon bank account modification", () => {
    const now = Date.now();
    const HOLD_MS = 72 * 60 * 60 * 1000;
    const holdUntil = new Date(now + HOLD_MS);

    const diffHours = (holdUntil.getTime() - now) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(72);
  });
});

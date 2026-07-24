import { AppError } from "@/lib/errors";

export const MIN_PAYOUT_VND = 100_000n;
export const BETA_MAX_PAYOUT_VND = 500_000n;
export const BETA_DAILY_AVAILABLE_LIMIT_VND = 500_000n;
export const DEFAULT_SYSTEM_DAILY_PAYOUT_BUDGET_VND = 5_000_000n;

export function startOfVietnamDay(now = new Date()): Date {
  const vietnamOffsetMs = 7 * 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + vietnamOffsetMs);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
      vietnamOffsetMs
  );
}

export function assertMoney(value: bigint, label = "amount"): void {
  if (value < 0n) {
    throw new AppError("VALIDATION_ERROR", `${label} cannot be negative.`, 400);
  }
}

export function cashbackFromCommission(netCommissionVnd: bigint, shareBps: number): bigint {
  assertMoney(netCommissionVnd, "net commission");
  if (!Number.isInteger(shareBps) || shareBps < 0 || shareBps > 10_000) {
    throw new AppError("VALIDATION_ERROR", "shareBps must be between 0 and 10000.", 400);
  }
  return (netCommissionVnd * BigInt(shareBps)) / 10_000n;
}

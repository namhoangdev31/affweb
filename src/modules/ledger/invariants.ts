export type BalancedLine = {
  direction: "DEBIT" | "CREDIT";
  amountVnd: bigint;
};

export function isBalancedJournal(lines: readonly BalancedLine[]): boolean {
  if (lines.length < 2 || lines.some((line) => line.amountVnd <= 0n)) return false;
  const debit = lines
    .filter((line) => line.direction === "DEBIT")
    .reduce((sum, line) => sum + line.amountVnd, 0n);
  const credit = lines
    .filter((line) => line.direction === "CREDIT")
    .reduce((sum, line) => sum + line.amountVnd, 0n);
  return debit > 0n && debit === credit;
}

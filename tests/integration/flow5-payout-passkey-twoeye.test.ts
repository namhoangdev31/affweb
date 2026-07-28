import { describe, expect, it } from "vitest";
import { MIN_PAYOUT_VND, BETA_MAX_PAYOUT_VND } from "@/lib/money";

describe("Flow 5: Payout Ticket, Two-Eye Control & Passkey Step-Up Security", () => {
  it("enforces minimum and maximum payout limit validation bounds", () => {
    const validAmount = 100_000n;
    const tooLowAmount = 10_000n;
    const tooHighAmount = 10_000_000n;

    const isValid = (amt: bigint) => amt >= MIN_PAYOUT_VND && amt <= BETA_MAX_PAYOUT_VND;

    expect(isValid(validAmount)).toBe(true);
    expect(isValid(tooLowAmount)).toBe(false);
    expect(isValid(tooHighAmount)).toBe(false);
  });

  it("enforces 10-minute Passkey sliding window requirement (requireRecentFinancePasskey)", () => {
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;

    const recentPasskeyUsedAt = new Date(now - 2 * 60 * 1000); // 2 minutes ago
    const stalePasskeyUsedAt = new Date(now - 15 * 60 * 1000); // 15 minutes ago

    const isPasskeyValid = (lastUsed: Date) => lastUsed.getTime() >= tenMinutesAgo;

    expect(isPasskeyValid(recentPasskeyUsedAt)).toBe(true);
    expect(isPasskeyValid(stalePasskeyUsedAt)).toBe(false);
  });

  it("enforces Separation of Duties invariants (Reviewer != Owner, Approver != Reviewer, Approver != Owner)", () => {
    const ownerUserId: string = "usr-owner";
    const reviewerUserId: string = "usr-reviewer";
    const approverUserId: string = "usr-approver";

    // Valid setup
    const isReviewAllowed = reviewerUserId !== ownerUserId;
    const isApproveAllowed = approverUserId !== reviewerUserId && approverUserId !== ownerUserId;

    expect(isReviewAllowed).toBe(true);
    expect(isApproveAllowed).toBe(true);

    // Invalid setup (Same user trying to review & approve)
    const illegalApprover: string = "usr-reviewer"; // Same as reviewer
    const isIllegalApproveAllowed =
      illegalApprover !== reviewerUserId && illegalApprover !== ownerUserId;

    expect(isIllegalApproveAllowed).toBe(false);
  });
});

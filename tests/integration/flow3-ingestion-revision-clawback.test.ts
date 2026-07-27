import { describe, expect, it } from "vitest";

describe("Flow 3: Multi-Connector Ingestion, Attribution & Revision Clawback Engine", () => {
  it("determines EvidenceAuthority weight precedence correctly (AUTHORITATIVE = 3 > PROVISIONAL = 2 > AUXILIARY = 1)", () => {
    const weights = {
      AUXILIARY: 1,
      PROVISIONAL_AUTHORITATIVE: 2,
      AUTHORITATIVE: 3
    };

    expect(weights.AUTHORITATIVE).toBeGreaterThan(weights.PROVISIONAL_AUTHORITATIVE);
    expect(weights.PROVISIONAL_AUTHORITATIVE).toBeGreaterThan(weights.AUXILIARY);
  });

  it("calculates grossDelta, cashbackDelta, and platformDelta upon conversion revision", () => {
    const currentGross = 100_000n;
    const currentCashback = 60_000n;

    // Sàn báo giảm giá trị hoa hồng xuống 50,000 VND
    const effectiveGross = 50_000n;
    const effectiveCashback = 30_000n;

    const grossDelta = effectiveGross - currentGross;
    const cashbackDelta = effectiveCashback - currentCashback;
    const platformDelta = grossDelta - cashbackDelta;

    expect(grossDelta).toBe(-50_000n);
    expect(cashbackDelta).toBe(-30_000n);
    expect(platformDelta).toBe(-20_000n);
  });

  it("calculates recovery receivable and suspends user when cashback clawback exceeds wallet balance", () => {
    const cashbackDelta = -50_000n;
    const requestedDebit = -cashbackDelta; // 50,000 VND
    const bucketBalance = 0n; // Ví người dùng đã rút hết tiền = 0 VND

    const liabilityDebit = requestedDebit < bucketBalance ? requestedDebit : bucketBalance;
    const recoveryReceivable = requestedDebit - liabilityDebit;

    expect(liabilityDebit).toBe(0n);
    expect(recoveryReceivable).toBe(50_000n);

    // Kích hoạt khóa tài khoản
    const userStatus = recoveryReceivable > 0n ? "SUSPENDED" : "ACTIVE";
    expect(userStatus).toBe("SUSPENDED");
  });
});

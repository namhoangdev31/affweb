import { describe, expect, it } from "vitest";
import {
  canTransitionPayoutApproval,
  canTransitionPayoutSettlement,
  canTransitionTenantPayout,
  deriveLegacyTenantPayoutStatus
} from "@/modules/tenants/payout-state";

describe("tenant payout state machine", () => {
  it("supports automatic submission and terminal outcomes", () => {
    expect(canTransitionTenantPayout("RESERVED", "SUBMITTED")).toBe(true);
    expect(canTransitionTenantPayout("SUBMITTED", "PROCESSING")).toBe(true);
    expect(canTransitionTenantPayout("PROCESSING", "PAID")).toBe(true);
  });

  it("allows UNKNOWN only to reconcile and never resend", () => {
    expect(canTransitionTenantPayout("UNKNOWN", "PROCESSING")).toBe(true);
    expect(canTransitionTenantPayout("UNKNOWN", "PAID")).toBe(true);
    expect(canTransitionTenantPayout("UNKNOWN", "SUBMITTED")).toBe(false);
  });

  it("keeps terminal outcomes terminal", () => {
    expect(canTransitionTenantPayout("PAID", "SUBMITTED")).toBe(false);
    expect(canTransitionTenantPayout("FAILED", "SUBMITTED")).toBe(false);
  });

  it("enforces approval lifecycle transitions", () => {
    expect(canTransitionPayoutApproval("PENDING", "APPROVED")).toBe(true);
    expect(canTransitionPayoutApproval("PENDING", "REJECTED")).toBe(true);
    expect(canTransitionPayoutApproval("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionPayoutApproval("APPROVED", "REJECTED")).toBe(false);
    expect(canTransitionPayoutApproval("REJECTED", "APPROVED")).toBe(false);
  });

  it("enforces settlement lifecycle transitions", () => {
    expect(canTransitionPayoutSettlement("NOT_STARTED", "PROCESSING")).toBe(true);
    expect(canTransitionPayoutSettlement("PROCESSING", "PAID")).toBe(true);
    expect(canTransitionPayoutSettlement("PROCESSING", "FAILED")).toBe(true);
    expect(canTransitionPayoutSettlement("PROCESSING", "UNKNOWN")).toBe(true);
    expect(canTransitionPayoutSettlement("UNKNOWN", "PAID")).toBe(true);
    expect(canTransitionPayoutSettlement("PAID", "PROCESSING")).toBe(false);
  });

  it("correctly derives legacy compatibility status", () => {
    expect(deriveLegacyTenantPayoutStatus("PENDING", "NOT_STARTED")).toBe("RESERVED");
    expect(deriveLegacyTenantPayoutStatus("APPROVED", "NOT_STARTED")).toBe("RESERVED");
    expect(deriveLegacyTenantPayoutStatus("APPROVED", "PROCESSING")).toBe("PROCESSING");
    expect(deriveLegacyTenantPayoutStatus("APPROVED", "PAID")).toBe("PAID");
    expect(deriveLegacyTenantPayoutStatus("APPROVED", "FAILED")).toBe("FAILED");
    expect(deriveLegacyTenantPayoutStatus("APPROVED", "UNKNOWN")).toBe("UNKNOWN");
    expect(deriveLegacyTenantPayoutStatus("REJECTED", "NOT_STARTED")).toBe("CANCELLED");
    expect(deriveLegacyTenantPayoutStatus("CANCELLED", "NOT_STARTED")).toBe("CANCELLED");
  });
});

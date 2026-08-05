import { describe, expect, it } from "vitest";
import {
  canApprovePayout,
  canCancelPayout,
  canRequestMemberWithdrawal,
  canRequestTreasuryWithdrawal
} from "@/modules/tenants/payout-policy";

const memberPayout = {
  tenantId: "tenant-a",
  userId: "user-a",
  requestedByUserId: "user-a",
  type: "MEMBER_WITHDRAWAL" as const
};

describe("tenant payout policy", () => {
  it("only lets a human request their own member withdrawal", () => {
    expect(
      canRequestMemberWithdrawal({
        actorUserId: "user-a",
        actorRole: "TENANT_USER",
        targetTenantId: "tenant-a",
        targetUserId: "user-a"
      })
    ).toBe(true);
    expect(
      canRequestMemberWithdrawal({
        actorUserId: "user-a",
        actorRole: "TENANT_USER",
        targetTenantId: "tenant-a",
        targetUserId: "user-b"
      })
    ).toBe(false);
  });

  it("keeps treasury approval Owner-only", () => {
    expect(canRequestTreasuryWithdrawal("TENANT_MASTER")).toBe(true);
    expect(
      canApprovePayout({
        actorRole: "TENANT_MASTER",
        actorTargetTenantId: "tenant-a",
        payout: { ...memberPayout, type: "TENANT_TREASURY_WITHDRAWAL" }
      })
    ).toBe(false);
  });

  it("rejects cross-tenant approval and allows requester cancellation", () => {
    expect(
      canApprovePayout({
        actorRole: "OWNER",
        actorTargetTenantId: "tenant-b",
        payout: memberPayout
      })
    ).toBe(false);
    expect(
      canCancelPayout({
        actorUserId: "user-a",
        actorRole: "TENANT_USER",
        actorTargetTenantId: "tenant-a",
        payout: memberPayout
      })
    ).toBe(true);
  });
});

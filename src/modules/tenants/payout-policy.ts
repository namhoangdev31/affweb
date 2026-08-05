import type { FinancialActorRole } from "@/modules/tenants/persona";

export type PayoutPolicyRecord = {
  tenantId: string;
  userId: string;
  requestedByUserId: string | null;
  type: "MEMBER_WITHDRAWAL" | "TENANT_TREASURY_WITHDRAWAL";
};

export function canRequestMemberWithdrawal(input: {
  actorUserId: string | null;
  actorRole: FinancialActorRole;
  targetTenantId: string;
  targetUserId: string;
}): boolean {
  return (
    input.actorRole !== "SYSTEM_WORKER" &&
    input.actorUserId === input.targetUserId &&
    input.targetTenantId.length > 0
  );
}

export function canRequestTreasuryWithdrawal(role: FinancialActorRole): boolean {
  return role === "TENANT_MASTER" || role === "OWNER";
}

export function canApprovePayout(input: {
  actorRole: FinancialActorRole;
  actorTargetTenantId: string;
  payout: PayoutPolicyRecord;
}): boolean {
  if (input.actorTargetTenantId !== input.payout.tenantId) return false;
  if (input.payout.type === "TENANT_TREASURY_WITHDRAWAL") {
    return input.actorRole === "OWNER";
  }
  return input.actorRole === "TENANT_MASTER" || input.actorRole === "OWNER";
}

export function canCancelPayout(input: {
  actorUserId: string | null;
  actorRole: FinancialActorRole;
  actorTargetTenantId: string;
  payout: PayoutPolicyRecord;
}): boolean {
  if (input.actorTargetTenantId !== input.payout.tenantId) return false;
  if (input.actorUserId && input.actorUserId === input.payout.requestedByUserId) return true;
  return input.actorRole === "OWNER" || input.actorRole === "TENANT_MASTER";
}

export function canRequestReconciliation(input: {
  actorRole: FinancialActorRole;
  actorTargetTenantId: string;
  payoutTenantId: string;
}): boolean {
  return (
    input.actorTargetTenantId === input.payoutTenantId &&
    (input.actorRole === "OWNER" || input.actorRole === "TENANT_MASTER")
  );
}

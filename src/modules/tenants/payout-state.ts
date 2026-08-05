import type {
  PayoutApprovalStatus,
  PayoutSettlementStatus,
  TenantPayoutStatus
} from "@/generated/prisma/client";

const legacyTransitions: Record<TenantPayoutStatus, readonly TenantPayoutStatus[]> = {
  RESERVED: ["SUBMITTED", "PROCESSING", "CANCELLED"],
  SUBMITTED: ["PROCESSING", "PAID", "FAILED", "UNKNOWN"],
  PROCESSING: ["PAID", "FAILED", "UNKNOWN"],
  UNKNOWN: ["PROCESSING", "PAID", "FAILED"],
  PAID: [],
  FAILED: [],
  CANCELLED: []
};

const approvalTransitions: Record<PayoutApprovalStatus, readonly PayoutApprovalStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: []
};

const settlementTransitions: Record<PayoutSettlementStatus, readonly PayoutSettlementStatus[]> = {
  NOT_STARTED: ["PROCESSING"],
  PROCESSING: ["PAID", "FAILED", "UNKNOWN"],
  UNKNOWN: ["PROCESSING", "PAID", "FAILED"],
  PAID: [],
  FAILED: []
};

export function canTransitionTenantPayout(
  from: TenantPayoutStatus,
  to: TenantPayoutStatus
): boolean {
  return from === to || legacyTransitions[from].includes(to);
}

export function canTransitionPayoutApproval(
  from: PayoutApprovalStatus,
  to: PayoutApprovalStatus
): boolean {
  return from === to || approvalTransitions[from].includes(to);
}

export function canTransitionPayoutSettlement(
  from: PayoutSettlementStatus,
  to: PayoutSettlementStatus
): boolean {
  return from === to || settlementTransitions[from].includes(to);
}

export function deriveLegacyTenantPayoutStatus(
  approval: PayoutApprovalStatus,
  settlement: PayoutSettlementStatus
): TenantPayoutStatus {
  if (approval === "REJECTED" || approval === "CANCELLED") {
    return "CANCELLED";
  }
  if (approval === "PENDING") {
    return "RESERVED";
  }
  switch (settlement) {
    case "NOT_STARTED":
      return "RESERVED";
    case "PROCESSING":
      return "PROCESSING";
    case "PAID":
      return "PAID";
    case "FAILED":
      return "FAILED";
    case "UNKNOWN":
      return "UNKNOWN";
  }
}

export type PayoutState =
  | "DRAFT"
  | "RESERVED"
  | "REVIEWED"
  | "APPROVED"
  | "SUBMITTED"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "UNKNOWN"
  | "CANCELLED";

const TRANSITIONS: Record<PayoutState, readonly PayoutState[]> = {
  DRAFT: ["RESERVED", "CANCELLED"],
  RESERVED: ["REVIEWED", "CANCELLED"],
  REVIEWED: ["APPROVED", "CANCELLED"],
  APPROVED: ["SUBMITTED", "UNKNOWN"],
  SUBMITTED: ["PROCESSING", "PAID", "FAILED", "UNKNOWN"],
  PROCESSING: ["PAID", "FAILED", "UNKNOWN"],
  UNKNOWN: ["PROCESSING", "PAID", "FAILED"],
  PAID: [],
  FAILED: [],
  CANCELLED: []
};

export function canTransitionPayout(from: PayoutState, to: PayoutState): boolean {
  return TRANSITIONS[from].includes(to);
}

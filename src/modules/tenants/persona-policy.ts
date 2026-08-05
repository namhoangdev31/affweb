export type DerivedTenantPersona = "OWNER" | "MASTER_MEMBER" | "TENANT_MASTER" | "TENANT_USER";

export function deriveTenantPersona(input: {
  userId: string;
  masterOwnerUserId: string;
  masterTenantId: string;
  membershipTenantId: string | null;
  membershipKind: "MASTER" | "STANDARD" | null;
  ownsStandardTenant: boolean;
}): DerivedTenantPersona {
  if (input.userId === input.masterOwnerUserId) return "OWNER";
  if (input.membershipTenantId === input.masterTenantId && input.membershipKind === "MASTER") {
    return input.ownsStandardTenant ? "TENANT_MASTER" : "MASTER_MEMBER";
  }
  if (input.membershipKind === "STANDARD" && !input.ownsStandardTenant) return "TENANT_USER";
  throw new Error("Invalid tenant hierarchy");
}

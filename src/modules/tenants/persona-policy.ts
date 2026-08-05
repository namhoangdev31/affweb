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
  if (input.ownsStandardTenant) return "TENANT_MASTER";
  if (input.membershipKind === "STANDARD" && input.membershipTenantId !== input.masterTenantId) {
    return "TENANT_USER";
  }
  return "MASTER_MEMBER";
}

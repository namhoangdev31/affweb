import { describe, expect, it } from "vitest";
import { deriveTenantPersona } from "@/modules/tenants/persona-policy";

const base = {
  userId: "user",
  masterOwnerUserId: "owner",
  masterTenantId: "master",
  membershipTenantId: "master",
  membershipKind: "MASTER" as const,
  ownsStandardTenant: false
};

describe("deriveTenantPersona", () => {
  it("derives the four portal personas without persisting a duplicate role", () => {
    expect(deriveTenantPersona({ ...base, userId: "owner" })).toBe("OWNER");
    expect(deriveTenantPersona(base)).toBe("MASTER_MEMBER");
    expect(deriveTenantPersona({ ...base, ownsStandardTenant: true })).toBe("TENANT_MASTER");
    expect(
      deriveTenantPersona({
        ...base,
        membershipTenantId: "child",
        membershipKind: "STANDARD"
      })
    ).toBe("TENANT_USER");
  });

  it("handles a child member that also owns a tenant as TENANT_MASTER", () => {
    expect(
      deriveTenantPersona({
        ...base,
        membershipTenantId: "child",
        membershipKind: "STANDARD",
        ownsStandardTenant: true
      })
    ).toBe("TENANT_MASTER");
  });

  it("handles users before master membership backfill as MASTER_MEMBER", () => {
    expect(
      deriveTenantPersona({
        ...base,
        membershipTenantId: null,
        membershipKind: null
      })
    ).toBe("MASTER_MEMBER");
  });
});

import { describe, expect, it } from "vitest";
import {
  hasVerifiedGoogleConnection,
  primaryVerifiedEmail,
  type ClerkUserLike
} from "@/lib/clerk-identity-mapping";

function clerkUser(overrides: Partial<ClerkUserLike> = {}): ClerkUserLike {
  return {
    id: "user_test",
    firstName: "An",
    lastName: "Nguyen",
    imageUrl: "",
    updatedAt: Date.now(),
    primaryEmailAddressId: "email_primary",
    emailAddresses: [
      {
        id: "email_primary",
        emailAddress: "  USER@Example.com ",
        verification: { status: "verified" }
      }
    ],
    externalAccounts: [
      {
        provider: "oauth_google",
        verification: { status: "verified" }
      }
    ],
    banned: false,
    locked: false,
    ...overrides
  };
}

describe("Clerk identity mapping", () => {
  it("only accepts the verified primary email and normalizes it", () => {
    expect(primaryVerifiedEmail(clerkUser())).toBe("user@example.com");
    expect(
      primaryVerifiedEmail(
        clerkUser({
          emailAddresses: [
            {
              id: "email_primary",
              emailAddress: "user@example.com",
              verification: { status: "unverified" }
            },
            {
              id: "email_secondary",
              emailAddress: "verified@example.com",
              verification: { status: "verified" }
            }
          ]
        })
      )
    ).toBeNull();
  });

  it("requires a verified Google connection for admin access", () => {
    expect(hasVerifiedGoogleConnection(clerkUser())).toBe(true);
    expect(
      hasVerifiedGoogleConnection(
        clerkUser({
          externalAccounts: [
            { provider: "oauth_google", verification: { status: "unverified" } }
          ]
        })
      )
    ).toBe(false);
    expect(
      hasVerifiedGoogleConnection(
        clerkUser({
          externalAccounts: [
            { provider: "oauth_github", verification: { status: "verified" } }
          ]
        })
      )
    ).toBe(false);
  });
});

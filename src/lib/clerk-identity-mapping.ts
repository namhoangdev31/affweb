export type ClerkUserLike = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  updatedAt: number;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }>;
  externalAccounts: Array<{
    provider: string;
    verification: { status: string } | null;
  }>;
  banned: boolean;
  locked: boolean;
};

export function primaryVerifiedEmail(user: ClerkUserLike): string | null {
  const primary = user.emailAddresses.find(
    (email) =>
      email.id === user.primaryEmailAddressId && email.verification?.status === "verified"
  );
  return primary?.emailAddress.trim().toLowerCase() ?? null;
}

export function hasVerifiedGoogleConnection(user: ClerkUserLike): boolean {
  return user.externalAccounts.some(
    (account) =>
      account.provider.toLowerCase().includes("google") &&
      account.verification?.status === "verified"
  );
}

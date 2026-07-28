import { clerkClient } from "@clerk/nextjs/server";
import { IdentityState, Role, UserStatus } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { adminEmailAllowlist, loadServerEnv } from "../src/lib/env";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  throw new Error("Usage: pnpm clerk:bootstrap-admin admin@example.com");
}
if (!adminEmailAllowlist(loadServerEnv()).has(email)) {
  throw new Error("Email must be present in ADMIN_EMAIL_ALLOWLIST.");
}

const client = await clerkClient();
const result = await client.users.getUserList({ emailAddress: [email], limit: 10 });
const clerkUser = result.data.find(
  (candidate) => candidate.primaryEmailAddress?.emailAddress.toLowerCase() === email
);
if (!clerkUser || clerkUser.primaryEmailAddress?.verification?.status !== "verified") {
  throw new Error("A Clerk user with a verified primary email is required.");
}
const hasGoogle = clerkUser.externalAccounts.some(
  (account) =>
    account.provider.toLowerCase().includes("google") && account.verification?.status === "verified"
);
if (!hasGoogle) {
  throw new Error("The Clerk user must have a verified Google connection.");
}

const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() || null;
const local = await db.user.upsert({
  where: { email },
  create: {
    clerkUserId: clerkUser.id,
    email,
    emailVerified: new Date(),
    name,
    image: clerkUser.imageUrl || null,
    status: UserStatus.ACTIVE,
    identityState: IdentityState.ACTIVE,
    identityUpdatedAt: new Date(clerkUser.updatedAt),
    roles: {
      create: [{ role: Role.USER }, { role: Role.SUPER_ADMIN }]
    },
    wallet: { create: {} }
  },
  update: {
    clerkUserId: clerkUser.id,
    emailVerified: new Date(),
    name,
    image: clerkUser.imageUrl || null,
    status: UserStatus.ACTIVE,
    identityState: IdentityState.ACTIVE,
    identityUpdatedAt: new Date(clerkUser.updatedAt)
  }
});

await db.roleAssignment.upsert({
  where: { userId_role: { userId: local.id, role: Role.USER } },
  create: { userId: local.id, role: Role.USER },
  update: {}
});
await db.roleAssignment.upsert({
  where: { userId_role: { userId: local.id, role: Role.SUPER_ADMIN } },
  create: { userId: local.id, role: Role.SUPER_ADMIN, grantedByUserId: local.id },
  update: { grantedByUserId: local.id, grantedAt: new Date() }
});
await db.walletProjection.upsert({
  where: { userId: local.id },
  create: { userId: local.id },
  update: {}
});
await db.auditLog.create({
  data: {
    actorUserId: local.id,
    action: "super_admin.bootstrapped",
    entityType: "User",
    entityId: local.id,
    metadata: { clerkUserId: clerkUser.id }
  }
});

console.log(`SUPER_ADMIN ready for ${email}.`);
await db.$disconnect();

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { adminEmailAllowlist, hasDatabase, loadServerEnv } from "@/lib/env";
import { UserStatus, type Role } from "@/generated/prisma/client";

const env = loadServerEnv();
const adminEmails = adminEmailAllowlist(env);

export const authCapabilities = {
  google: Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
  email: Boolean(env.AUTH_RESEND_KEY && env.EMAIL_FROM)
};

const providers = [
  Google({
    clientId: env.AUTH_GOOGLE_ID ?? "google-not-configured",
    clientSecret: env.AUTH_GOOGLE_SECRET ?? "google-not-configured"
  }),
  Resend({
    apiKey: env.AUTH_RESEND_KEY ?? "resend-not-configured",
    from: env.EMAIL_FROM ?? "AffWeb <no-reply@example.invalid>"
  })
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...(hasDatabase(env) ? { adapter: PrismaAdapter(db) } : {}),
  ...(env.AUTH_SECRET ? { secret: env.AUTH_SECRET } : {}),
  trustHost: true,
  session: {
    strategy: hasDatabase(env) ? "database" : "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
    error: "/login"
  },
  providers,
  callbacks: {
    async signIn({ user, account, email: emailFlow }) {
      if (!hasDatabase(env)) return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;

      const existing = await db.user.findUnique({
        where: { email },
        select: { id: true, status: true, roles: { select: { role: true } } }
      });
      const hasAdminRole = existing?.roles.some(({ role }) => role !== "USER") ?? false;
      if (adminEmails.has(email) || hasAdminRole) {
        return account?.provider === "google" && adminEmails.has(email);
      }

      if (existing?.status === UserStatus.SUSPENDED || existing?.status === UserStatus.CLOSED) {
        return false;
      }
      if (env.REGISTRATION_MODE === "public") return true;
      if (!existing) return false;

      if (existing.status === UserStatus.INVITED && !emailFlow?.verificationRequest) {
        await db.user.update({
          where: { id: existing.id },
          data: { status: UserStatus.ACTIVE }
        });
      }
      return true;
    },
    async session({ session, user, token }) {
      const userId = user?.id ?? token?.sub;
      if (!userId) return session;
      session.user.id = userId;

      if (hasDatabase(env)) {
        const assignments = await db.roleAssignment.findMany({
          where: { userId },
          select: { role: true }
        });
        session.user.roles = assignments.map((assignment) => assignment.role);
      } else {
        session.user.roles = [];
      }
      return session;
    }
  },
  events: {
    async signIn({ user, account }) {
      const email = user.email?.toLowerCase();
      if (!hasDatabase(env) || !user.id || !email || !adminEmails.has(email)) return;
      await db.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "admin.signed_in",
          entityType: "User",
          entityId: user.id,
          metadata: { provider: account?.provider ?? "unknown" }
        }
      });
    },
    async createUser({ user }) {
      if (!hasDatabase(env) || !user.id) return;
      const email = user.email?.toLowerCase();
      await db.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.ACTIVE,
          roles: {
            create: {
              role: adminEmails.has(email ?? "") ? "SUPER_ADMIN" : "USER"
            }
          },
          wallet: { create: {} }
        }
      });
    }
  }
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: Role[];
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

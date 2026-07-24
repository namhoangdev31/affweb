"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { requestAccountDeletion } from "@/modules/identity/deletion";

export async function signOutAllSessionsAction() {
  const user = await requireUser();
  const client = await clerkClient();
  const sessions = await client.sessions.getSessionList({
    userId: user.clerkUserId,
    limit: 100
  });
  await Promise.all(sessions.data.map((session) => client.sessions.revokeSession(session.id)));
  await db.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "session.revoked_all",
      entityType: "User",
      entityId: user.id,
      metadata: { revokedCount: sessions.data.length }
    }
  });
  redirect("/");
}

export async function requestAccountDeletionAction(formData: FormData) {
  const user = await requireUser();
  const { reason } = z
    .object({ reason: z.string().trim().max(500).optional() })
    .parse(Object.fromEntries(formData));
  await requestAccountDeletion(user.id, reason);
  redirect("/app/settings?deletion=requested");
}

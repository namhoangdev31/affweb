"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";

export async function signOutAllSessionsAction() {
  const user = await requireUser();
  await db.$transaction([
    db.session.deleteMany({ where: { userId: user.id } }),
    db.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "session.revoked_all",
        entityType: "User",
        entityId: user.id
      }
    })
  ]);

  const cookieStore = await cookies();
  cookieStore.delete("authjs.session-token");
  cookieStore.delete("__Secure-authjs.session-token");
  redirect("/");
}

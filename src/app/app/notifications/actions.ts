"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() }
  });
  revalidatePath("/app/notifications");
}

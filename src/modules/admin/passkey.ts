import "server-only";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export async function requireRecentFinancePasskey(actorUserId: string): Promise<void> {
  const threshold = new Date(Date.now() - 10 * 60 * 1000);
  const passkey = await db.adminPasskey.findFirst({
    where: { userId: actorUserId, lastUsedAt: { gte: threshold } }
  });
  if (!passkey) {
    throw new AppError("STEP_UP_REQUIRED", "Finance action cần xác thực passkey gần đây.", 403);
  }
}

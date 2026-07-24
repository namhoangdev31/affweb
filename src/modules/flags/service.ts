import "server-only";

import { db } from "@/lib/db";

export async function featureEnabled(key: string, fallback = true): Promise<boolean> {
  const flag = await db.featureFlag.findUnique({ where: { key }, select: { enabled: true } });
  return flag?.enabled ?? fallback;
}

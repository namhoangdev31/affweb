import "server-only";

import webPush from "web-push";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { assertSafeSameOriginDeepLink } from "@/modules/connectors/url-policy";

export async function sendPushNotification(input: {
  userId: string;
  title: string;
  body: string;
  deepLink: string;
}): Promise<{ sent: number; removed: number }> {
  const env = loadServerEnv();
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return { sent: 0, removed: 0 };
  }
  webPush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
  const deepLink = assertSafeSameOriginDeepLink(input.deepLink);
  const subscriptions = await db.pushSubscription.findMany({ where: { userId: input.userId } });
  let sent = 0;
  let removed = 0;
  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        },
        JSON.stringify({
          title: "Hoàn Tiền",
          body: "Bạn có cập nhật mới. Mở ứng dụng để xem chi tiết.",
          deepLink
        }),
        { TTL: 3600, urgency: "normal" }
      );
      sent += 1;
      await db.pushSubscription.update({
        where: { id: subscription.id },
        data: { lastUsedAt: new Date() }
      });
    } catch (error) {
      const statusCode =
        typeof error === "object" && error && "statusCode" in error
          ? Number(error.statusCode)
          : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await db.pushSubscription.delete({ where: { id: subscription.id } });
        removed += 1;
      }
    }
  }
  return { sent, removed };
}

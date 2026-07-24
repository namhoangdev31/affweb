import "server-only";

import { Resend } from "resend";
import {
  DeliveryStatus,
  NotificationChannel,
  OutboxStatus,
  type Prisma
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendPushNotification } from "@/modules/push/service";

const payoutMessages: Record<
  string,
  { title: string; body: string; deepLink: string } | undefined
> = {
  "payout.reserved": {
    title: "Yêu cầu payout đã được tiếp nhận",
    body: "Yêu cầu của bạn đang chờ bộ phận tài chính kiểm tra.",
    deepLink: "/app/wallet"
  },
  "payout.approved": {
    title: "Yêu cầu payout đã được duyệt",
    body: "Yêu cầu đang được gửi đến đơn vị thanh toán.",
    deepLink: "/app/wallet"
  },
  "payout.paid": {
    title: "Payout đã hoàn tất",
    body: "Đơn vị thanh toán đã xác nhận yêu cầu của bạn thành công.",
    deepLink: "/app/wallet"
  },
  "payout.failed": {
    title: "Payout không thành công",
    body: "Số dư đã được hoàn lại vào ví khả dụng. Vui lòng kiểm tra thông tin nhận tiền.",
    deepLink: "/app/wallet"
  }
};

async function materializeOutboxNotifications(): Promise<number> {
  const events = await db.outboxEvent.findMany({
    where: { status: OutboxStatus.PENDING, availableAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 100
  });
  let published = 0;
  for (const event of events) {
    try {
      await db.$transaction(async (tx) => {
        const claimed = await tx.outboxEvent.updateMany({
          where: { id: event.id, status: OutboxStatus.PENDING },
          data: {
            status: OutboxStatus.PUBLISHED,
            publishedAt: new Date(),
            attempts: { increment: 1 }
          }
        });
        if (claimed.count === 0) return;
        const message = payoutMessages[event.eventType];
        if (message && event.aggregateType === "PayoutTicket") {
          const ticket = await tx.payoutTicket.findUnique({
            where: { id: event.aggregateId },
            select: { userId: true }
          });
          if (ticket) {
            await tx.notification.create({
              data: {
                userId: ticket.userId,
                type: event.eventType,
                title: message.title,
                body: message.body,
                deepLink: message.deepLink
              }
            });
          }
        }
      });
      published += 1;
    } catch (error) {
      await db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: OutboxStatus.FAILED,
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown error"
        }
      });
    }
  }
  return published;
}

async function ensureDeliveries(): Promise<void> {
  const notifications = await db.notification.findMany({
    where: { deliveries: { none: {} } },
    include: {
      user: { select: { email: true, pushSubscriptions: { select: { id: true }, take: 1 } } }
    },
    take: 100
  });
  for (const notification of notifications) {
    const rows: Prisma.NotificationDeliveryCreateManyInput[] = [
      {
        notificationId: notification.id,
        channel: NotificationChannel.IN_APP,
        status: DeliveryStatus.SENT,
        sentAt: notification.createdAt
      }
    ];
    if (notification.user.email) {
      rows.push({
        notificationId: notification.id,
        channel: NotificationChannel.EMAIL,
        status: DeliveryStatus.PENDING
      });
    }
    if (notification.user.pushSubscriptions.length > 0) {
      rows.push({
        notificationId: notification.id,
        channel: NotificationChannel.PUSH,
        status: DeliveryStatus.PENDING
      });
    }
    await db.notificationDelivery.createMany({ data: rows, skipDuplicates: true });
  }
}

export async function dispatchNotifications(): Promise<{
  published: number;
  sent: number;
  failed: number;
}> {
  const published = await materializeOutboxNotifications();
  await ensureDeliveries();
  const env = loadServerEnv();
  const deliveries = await db.notificationDelivery.findMany({
    where: {
      status: DeliveryStatus.PENDING,
      channel: { in: [NotificationChannel.EMAIL, NotificationChannel.PUSH] }
    },
    include: { notification: { include: { user: { select: { email: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 100
  });
  let sent = 0;
  let failed = 0;
  const resend = env.AUTH_RESEND_KEY ? new Resend(env.AUTH_RESEND_KEY) : undefined;

  for (const delivery of deliveries) {
    try {
      let providerId: string | undefined;
      if (delivery.channel === NotificationChannel.PUSH) {
        const result = await sendPushNotification({
          userId: delivery.notification.userId,
          title: delivery.notification.title,
          body: delivery.notification.body,
          deepLink: delivery.notification.deepLink ?? "/app/notifications"
        });
        if (result.sent === 0) {
          await db.notificationDelivery.update({
            where: { id: delivery.id },
            data: { status: DeliveryStatus.SUPPRESSED, attempts: { increment: 1 } }
          });
          continue;
        }
        providerId = `web-push:${result.sent}`;
      } else {
        const email = delivery.notification.user.email;
        if (!resend || !env.EMAIL_FROM || !email) {
          await db.notificationDelivery.update({
            where: { id: delivery.id },
            data: { status: DeliveryStatus.SUPPRESSED, attempts: { increment: 1 } }
          });
          continue;
        }
        const response = await resend.emails.send({
          from: env.EMAIL_FROM,
          to: email,
          subject: delivery.notification.title,
          text: `${delivery.notification.body}\n\nMở ứng dụng: ${new URL(
            delivery.notification.deepLink ?? "/app/notifications",
            env.APP_BASE_URL
          )}`
        });
        if (response.error) throw new Error(response.error.message);
        providerId = response.data?.id;
      }
      await db.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.SENT,
          attempts: { increment: 1 },
          sentAt: new Date(),
          ...(providerId ? { providerId } : {})
        }
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      logger.error("notification_delivery_failed", {
        deliveryId: delivery.id,
        channel: delivery.channel,
        error: error instanceof Error ? error.message : "unknown"
      });
      await db.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.FAILED,
          attempts: { increment: 1 },
          errorCode: error instanceof Error ? error.name.slice(0, 100) : "UNKNOWN"
        }
      });
    }
  }
  return { published, sent, failed };
}

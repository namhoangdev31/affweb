import "server-only";

import { Resend } from "resend";
import {
  DeliveryStatus,
  NotificationChannel,
  OutboxStatus,
  Role,
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
const OUTBOX_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];

async function materializeOutboxNotifications(): Promise<number> {
  const events = await db.outboxEvent.findMany({
    where: {
      eventType: { not: "zalo.reply.requested" },
      status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
      availableAt: { lte: new Date() }
    },
    orderBy: { createdAt: "asc" },
    take: 100
  });
  let published = 0;
  for (const event of events) {
    try {
      await db.$transaction(async (tx) => {
        const claimed = await tx.outboxEvent.updateMany({
          where: { id: event.id, status: event.status, attempts: event.attempts },
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
        } else if (
          event.eventType === "saas.payment.attention_required" &&
          event.aggregateType === "SaaSInvoice"
        ) {
          const operators = await tx.user.findMany({
            where: {
              status: "ACTIVE",
              roles: { some: { role: Role.SUPER_ADMIN } }
            },
            select: { id: true }
          });
          if (operators.length > 0) {
            await tx.notification.createMany({
              data: operators.map((operator) => ({
                userId: operator.id,
                type: event.eventType,
                title: "PayOS cần được kiểm tra",
                body: "Một webhook thanh toán không khớp invoice. Hãy kiểm tra audit log trước khi xử lý.",
                deepLink: "/admin/tenants"
              }))
            });
          }
        }
      });
      published += 1;
    } catch (error) {
      const attempts = event.attempts + 1;
      const terminal = attempts > OUTBOX_RETRY_DELAYS_MS.length;
      await db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: terminal ? OutboxStatus.DEAD : OutboxStatus.FAILED,
          attempts,
          availableAt: terminal
            ? new Date()
            : new Date(Date.now() + OUTBOX_RETRY_DELAYS_MS[attempts - 1]!),
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
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : undefined;

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

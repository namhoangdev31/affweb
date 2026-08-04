import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  decryptZaloIdentifier,
  encryptZaloIdentifier,
  hashZaloIdentifier,
  stableHash
} from "@/lib/crypto";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { requestPayloadHash } from "@/lib/request";
import { featureEnabled } from "@/modules/flags/service";
import { createAffiliateLink } from "@/modules/links/service";
import { requireTenantPlan, tenantSubscriptionIsEffective } from "@/modules/tenants/plans";
import { z } from "zod";

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];

async function requireZaloEnabled(): Promise<void> {
  const env = loadServerEnv();
  if (
    !env.ZALO_BOT_ENABLED ||
    !env.ZALO_BOT_TOKEN ||
    !env.ZALO_BOT_SECRET_TOKEN ||
    !env.ZALO_DATA_ENCRYPTION_KEY_V1 ||
    !(await featureEnabled("zalo.bot.enabled", false))
  ) {
    throw new AppError("CONNECTOR_DISABLED", "Zalo Bot đang tạm dừng.", 503);
  }
}

export async function createZaloBindingCode(input: {
  tenantId: string;
  ownerUserId: string;
}): Promise<{ code: string; expiresAt: Date }> {
  await requireZaloEnabled();
  const tenant = await db.tenant.findFirst({
    where: { id: input.tenantId, ownerUserId: input.ownerUserId }
  });
  if (!tenant || !tenantSubscriptionIsEffective(tenant)) {
    throw new AppError("FORBIDDEN", "Bạn không sở hữu tenant đang hoạt động này.", 403);
  }
  const plan = await requireTenantPlan(tenant.planCode ?? tenant.planId);
  if (!plan.allowZaloBot) {
    throw new AppError("FORBIDDEN", "Gói tenant không hỗ trợ Zalo Bot.", 403);
  }
  const code = `ZL-${randomBytes(6).toString("base64url").toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.$transaction([
    db.zaloBindingCode.updateMany({
      where: { tenantId: tenant.id, consumedAt: null },
      data: { consumedAt: new Date() }
    }),
    db.zaloBindingCode.create({
      data: {
        tenantId: tenant.id,
        tokenHash: stableHash(code),
        createdByUserId: input.ownerUserId,
        expiresAt
      }
    })
  ]);
  return { code, expiresAt };
}

async function bindGroup(input: {
  code: string;
  chatId: string;
  groupName?: string;
}): Promise<{ bindingId: string; tenantName: string }> {
  return db.$transaction(
    async (tx) => {
      const found = await tx.zaloBindingCode.findUnique({
        where: { tokenHash: stableHash(input.code) },
        select: { id: true }
      });
      if (!found) throw new AppError("VALIDATION_ERROR", "Mã liên kết không hợp lệ.", 400);
      await tx.$queryRaw`
        SELECT id FROM "ZaloBindingCode" WHERE id = ${found.id} FOR UPDATE
      `;
      const bindingCode = await tx.zaloBindingCode.findUniqueOrThrow({
        where: { id: found.id },
        include: { tenant: true }
      });
      if (bindingCode.consumedAt || bindingCode.expiresAt <= new Date()) {
        throw new AppError("CONFLICT", "Mã liên kết đã dùng hoặc hết hạn.", 409);
      }
      if (!tenantSubscriptionIsEffective(bindingCode.tenant)) {
        throw new AppError("FORBIDDEN", "Tenant đã hết hiệu lực.", 403);
      }
      const plan = await requireTenantPlan(
        bindingCode.tenant.planCode ?? bindingCode.tenant.planId,
        tx
      );
      if (!plan.allowZaloBot) {
        throw new AppError("FORBIDDEN", "Gói tenant không hỗ trợ Zalo Bot.", 403);
      }
      const chatIdHash = hashZaloIdentifier(input.chatId);
      const existing = await tx.zaloGroupBinding.findUnique({ where: { chatIdHash } });
      if (existing && existing.tenantId !== bindingCode.tenantId) {
        throw new AppError("CONFLICT", "Group Zalo đã liên kết với tenant khác.", 409);
      }
      const binding = existing
        ? await tx.zaloGroupBinding.update({
            where: { id: existing.id },
            data: {
              active: true,
              groupName: input.groupName?.slice(0, 120) ?? null,
              linkedById: bindingCode.createdByUserId,
              chatIdCiphertext: Uint8Array.from(encryptZaloIdentifier(input.chatId))
            }
          })
        : await tx.zaloGroupBinding.create({
            data: {
              chatId: `hash:${chatIdHash}`,
              chatIdHash,
              chatIdCiphertext: Uint8Array.from(encryptZaloIdentifier(input.chatId)),
              tenantId: bindingCode.tenantId,
              groupName: input.groupName?.slice(0, 120) ?? null,
              linkedById: bindingCode.createdByUserId,
              active: true
            }
          });
      await tx.zaloBindingCode.update({
        where: { id: bindingCode.id },
        data: { consumedAt: new Date() }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: bindingCode.createdByUserId,
          action: "zalo.group.bound",
          entityType: "ZaloGroupBinding",
          entityId: binding.id,
          metadata: { tenantId: bindingCode.tenantId, chatIdHash }
        }
      });
      return { bindingId: binding.id, tenantName: bindingCode.tenant.name };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

async function queueReply(input: {
  bindingId: string;
  messageKey: string;
  text: string;
}): Promise<void> {
  await db.outboxEvent.upsert({
    where: { idempotencyKey: `zalo:${input.messageKey}:reply` },
    create: {
      aggregateType: "ZaloGroupBinding",
      aggregateId: input.bindingId,
      eventType: "zalo.reply.requested",
      idempotencyKey: `zalo:${input.messageKey}:reply`,
      payload: { bindingId: input.bindingId, text: input.text }
    },
    update: {}
  });
}

export async function handleZaloBotIncomingUpdate(input: {
  chatId: string;
  messageId: string;
  messageText: string;
  groupName?: string;
  baseUrl: string;
}): Promise<{ replied: boolean; duplicate?: boolean; trackingUrl?: string }> {
  await requireZaloEnabled();
  const messageKey = hashZaloIdentifier(input.messageId);
  const requestHash = requestPayloadHash({
    chatIdHash: hashZaloIdentifier(input.chatId),
    messageText: input.messageText
  });
  const receipt = await db.idempotencyRecord.findUnique({
    where: {
      namespace_idempotencyKey: {
        namespace: "zalo.webhook",
        idempotencyKey: messageKey
      }
    }
  });
  if (receipt) {
    if (receipt.requestHash !== requestHash) {
      throw new AppError("CONFLICT", "Zalo message ID bị tái sử dụng.", 409);
    }
    return { replied: true, duplicate: true };
  }

  const command = input.messageText.trim().match(/^\/link\s+(ZL-[A-Z0-9_-]+)$/i);
  if (command?.[1]) {
    const linked = await bindGroup({
      code: command[1].toUpperCase(),
      chatId: input.chatId,
      ...(input.groupName ? { groupName: input.groupName } : {})
    });
    await queueReply({
      bindingId: linked.bindingId,
      messageKey,
      text: `Đã liên kết group với ${linked.tenantName}. Link trong group sẽ ghi nhận cho tenant owner; không phát sinh cashback member.`
    });
    try {
      await dispatchZaloOutbox();
    } catch {
      // Outbox event is safely persisted for fallback retry
    }
    await db.idempotencyRecord.create({
      data: {
        namespace: "zalo.webhook",
        idempotencyKey: messageKey,
        requestHash,
        responseStatus: 200,
        responseBody: { replied: true },
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    return { replied: true };
  }

  const binding = await db.zaloGroupBinding.findUnique({
    where: { chatIdHash: hashZaloIdentifier(input.chatId) },
    include: { tenant: true }
  });
  if (!binding?.active || !binding.tenant.ownerUserId) return { replied: false };
  if (!tenantSubscriptionIsEffective(binding.tenant)) return { replied: false };
  const url = input.messageText.match(/https:\/\/[^\s]+/i)?.[0];
  if (!url) return { replied: false };
  if (binding.routingMode === "ACCESSTRADE_CAMPAIGN" && !binding.accessTradeCampaignId) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Group chưa cấu hình AccessTrade campaign.", 503);
  }

  const result = await createAffiliateLink({
    userId: binding.tenant.ownerUserId,
    tenantChannelId: binding.tenantId,
    url,
    ...(binding.routingMode === "ACCESSTRADE_CAMPAIGN"
      ? { campaignId: binding.accessTradeCampaignId! }
      : {}),
    clientIdempotencyKey: `zalo:${messageKey}`,
    source: "zalo",
    requestHash: stableHash(
      `${binding.tenantId}:${binding.routingMode}:${binding.accessTradeCampaignId ?? ""}:${url}`
    )
  });
  const trackingUrl = new URL(result.redirectUrl, input.baseUrl).toString();
  await queueReply({
    bindingId: binding.id,
    messageKey,
    text: `Link ${result.platform.replaceAll("_", " ")} của kênh ${binding.tenant.name}: ${trackingUrl}\nHoa hồng được ghi nhận trực tiếp cho tenant owner; link này không có cashback member.`
  });
  try {
    await dispatchZaloOutbox();
  } catch {
    // Outbox event is safely persisted for fallback retry
  }
  await db.idempotencyRecord.create({
    data: {
      namespace: "zalo.webhook",
      idempotencyKey: messageKey,
      requestHash,
      responseStatus: 200,
      responseBody: { replied: true, trackingUrl },
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });
  return { replied: true, trackingUrl };
}

const outboxPayloadSchema = z.object({
  bindingId: z.string().cuid(),
  text: z.string().min(1).max(2_000)
});

async function sendMessage(chatId: string, text: string): Promise<void> {
  const token = loadServerEnv().ZALO_BOT_TOKEN;
  if (!token) throw new AppError("CONNECTOR_DISABLED", "Zalo Bot chưa cấu hình.", 503);
  const response = await fetch(
    `https://bot-api.zaloplatforms.com/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000)
    }
  );
  const responseText = await response.text();
  if (responseText.length > 65_536) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Zalo sendMessage trả dữ liệu quá lớn.", 503);
  }
  const payload = z
    .object({ ok: z.boolean(), description: z.string().optional() })
    .passthrough()
    .parse(JSON.parse(responseText));
  if (!response.ok || !payload.ok) {
    throw new AppError("CONNECTOR_UNAVAILABLE", "Zalo sendMessage thất bại.", 503);
  }
}

export async function dispatchZaloOutbox(): Promise<{
  sent: number;
  failed: number;
  dead: number;
}> {
  await requireZaloEnabled();
  const events = await db.outboxEvent.findMany({
    where: {
      eventType: "zalo.reply.requested",
      status: { in: ["PENDING", "FAILED"] },
      availableAt: { lte: new Date() }
    },
    orderBy: { createdAt: "asc" },
    take: 50
  });
  let sent = 0;
  let failed = 0;
  let dead = 0;
  for (const event of events) {
    const claimed = await db.outboxEvent.updateMany({
      where: {
        id: event.id,
        status: event.status,
        attempts: event.attempts
      },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        availableAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });
    if (claimed.count === 0) continue;
    try {
      const payload = outboxPayloadSchema.parse(event.payload);
      const binding = await db.zaloGroupBinding.findFirst({
        where: {
          id: payload.bindingId,
          active: true,
          chatIdCiphertext: { not: null }
        }
      });
      if (!binding?.chatIdCiphertext) {
        throw new AppError("NOT_FOUND", "Zalo binding không còn hiệu lực.", 404);
      }
      await sendMessage(decryptZaloIdentifier(binding.chatIdCiphertext), payload.text);
      await db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          lastError: null
        }
      });
      sent += 1;
    } catch (error) {
      const attempts = event.attempts + 1;
      const terminal = attempts > RETRY_DELAYS_MS.length;
      await db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: terminal ? "DEAD" : "FAILED",
          availableAt: terminal
            ? new Date()
            : new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]!),
          lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown error"
        }
      });
      if (terminal) dead += 1;
      else failed += 1;
    }
  }
  return { sent, failed, dead };
}

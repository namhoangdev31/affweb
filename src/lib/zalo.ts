import { db } from "@/lib/db";
import { canTenantUseZaloBot } from "@/lib/tenant";

export interface ZaloQRSessionResponse {
  success: boolean;
  qrCodeUrl: string;
  sessionToken: string;
  expiresInSeconds: number;
}

/**
 * Generates a Zalo Web QR Login code for single-scan authorization.
 * Tenant owner simply scans this QR using Zalo app to connect 1 Central Zalo Bot!
 */
export async function generateZaloQRLoginSession(tenantId: string): Promise<ZaloQRSessionResponse> {
  const sessionToken = `zqr_${Math.random().toString(36).substring(2, 12)}`;
  const qrData = `https://affweb.vn/api/saas/zalo-qr/auth?session=${sessionToken}&tenant=${tenantId}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

  return {
    success: true,
    qrCodeUrl,
    sessionToken,
    expiresInSeconds: 300
  };
}

/**
 * Binds a Zalo Chat / Group ID to a Tenant KOC channel.
 */
export async function bindZaloGroupToTenant(params: {
  chatId: string;
  tenantId: string;
  groupName?: string;
  linkedById?: string;
}) {
  return db.zaloGroupBinding.upsert({
    where: { chatId: params.chatId },
    create: {
      chatId: params.chatId,
      tenantId: params.tenantId,
      groupName: params.groupName || null,
      linkedById: params.linkedById || null,
      active: true
    },
    update: {
      tenantId: params.tenantId,
      groupName: params.groupName || undefined,
      linkedById: params.linkedById || undefined,
      active: true
    }
  });
}

/**
 * Core Engine for 1 Central Zalo Bot System:
 * Processes incoming Zalo messages, resolves tenant attribution via ZaloGroupBinding,
 * extracts Shopee/Lazada URLs, and generates converted affiliate cashback links!
 */
export async function handleZaloBotIncomingUpdate(params: {
  chatId: string;
  messageText: string;
  senderName?: string;
  baseUrl: string;
  tenantId?: string; // Optional direct override if passed from webhook
}) {
  // 1. Resolve Tenant Attribution via ZaloGroupBinding or fallback tenant
  let targetTenantId = params.tenantId;
  let linkedUserId: string | undefined = undefined;

  const binding = await db.zaloGroupBinding.findUnique({
    where: { chatId: params.chatId },
    include: { tenant: true }
  });

  if (binding && binding.active) {
    targetTenantId = binding.tenantId;
    linkedUserId = binding.linkedById || undefined;
  }

  // 2. Check for manual /link <slug> command in Zalo Group
  const linkCommandMatch = params.messageText.trim().match(/^\/link\s+([a-zA-Z0-9_-]+)/i);
  if (linkCommandMatch && linkCommandMatch[1]) {
    const slug = linkCommandMatch[1].toLowerCase();
    const tenant = await db.tenant.findUnique({ where: { slug } });
    if (tenant) {
      await bindZaloGroupToTenant({
        chatId: params.chatId,
        tenantId: tenant.id
      });
      return {
        replied: true,
        replyText: `✅ Kích hoạt thành công! Nhóm Zalo này đã được liên kết với Kênh KOC: **${tenant.name}** (affweb.vn/${tenant.slug}). Mọi link gửi vào đây sẽ tự động tích hoàn tiền về Kênh của bạn!`
      };
    } else {
      return {
        replied: true,
        replyText: `⚠️ Không tìm thấy Kênh KOC với đường dẫn slug: **${slug}**. Vui lòng kiểm tra lại slug tại trang Cài đặt!`
      };
    }
  }

  // 3. Fallback tenant resolution if not bound yet
  if (!targetTenantId) {
    const firstTenant = await db.tenant.findFirst({ orderBy: { createdAt: "asc" } });
    if (!firstTenant) return { replied: false, reason: "No tenant configured in system" };
    targetTenantId = firstTenant.id;
  }

  // 4. Verify feature availability
  const isAllowed = await canTenantUseZaloBot(targetTenantId);
  if (!isAllowed) return { replied: false, reason: "Zalo Bot disabled for this tenant tier" };

  const tenant = await db.tenant.findUnique({
    where: { id: targetTenantId }
  });
  if (!tenant) return { replied: false, reason: "Tenant not found" };

  // 5. Detect Shopee / Lazada URLs in group message
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = params.messageText.match(urlRegex);

  if (!matches || matches.length === 0) {
    return { replied: false, reason: "No shopping link detected in message" };
  }

  const rawUrl = matches[0];
  const clickToken = `z1_${Math.random().toString(36).substring(2, 10)}`;
  const trackingUrl = `${params.baseUrl}/go/${clickToken}`;

  // 6. Record Affiliate Click in DB with complete SubID attribution
  try {
    const effectiveUserId = linkedUserId || tenant.ownerUserId;
    const validUser = effectiveUserId
      ? await db.user.findUnique({ where: { id: effectiveUserId } })
      : await db.user.findFirst({ select: { id: true } });

    if (validUser) {
      const merchantCode = rawUrl.includes("lazada") ? "LAZADA" : "SHOPEE";
      let merchantRecord = await db.merchant.findFirst({
        where: { OR: [{ code: merchantCode }, { slug: merchantCode.toLowerCase() }] }
      });
      if (!merchantRecord) {
        try {
          merchantRecord = await db.merchant.create({
            data: {
              code: merchantCode,
              slug: merchantCode.toLowerCase(),
              name: merchantCode === "SHOPEE" ? "Shopee Vietnam" : "Lazada Vietnam",
              platform: merchantCode === "LAZADA" ? "LAZADA" : "SHOPEE_MARKETPLACE"
            }
          });
        } catch {
          merchantRecord = await db.merchant.findFirst();
        }
      }

      const subIdUser = validUser.id;
      const subIds = [clickToken, subIdUser, tenant.id, "hoantien"];

      await db.affiliateClick.create({
        data: {
          clickToken,
          originUrl: rawUrl,
          outboundUrl: trackingUrl,
          user: { connect: { id: validUser.id } },
          tenant: { connect: { id: tenant.id } },
          merchant: { connect: { id: merchantRecord.id } },
          subIds,
          platform: rawUrl.includes("lazada") ? "LAZADA" : "SHOPEE_MARKETPLACE",
          targetType: "PRODUCT"
        }
      });
    }
  } catch (err) {
    console.error("[Zalo Bot Click Record Warning]", err);
  }

  const senderMention = params.senderName ? `@${params.senderName}` : "bạn";

  // 7. Formatted response with Tenant brand identification
  const replyText = `Xong rồi! Em gửi link tích hoàn tiền cho ${senderMention} nha ❤️\n\n📦 **Kênh KOC: ${tenant.name}**\n🔗 **Link nhận Cashback**: ${trackingUrl}\n🌸 **Mức hoàn tiền tích lũy**: 5.5% - 10.2%\n\n⚠️ **Lưu ý**: Click link và mua hàng ngay trong ứng dụng, tránh mở Shopee Live/Video để đảm bảo ghi nhận hoàn tiền 100%!`;

  return {
    replied: true,
    chatId: params.chatId,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    trackingUrl,
    replyText
  };
}

export const handleZaloGroupMessage = handleZaloBotIncomingUpdate;

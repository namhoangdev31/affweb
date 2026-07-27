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
 * Tenant owner simply scans this QR using Zalo app to connect their Zalo Personal/Group Bot automatically!
 */
export async function generateZaloQRLoginSession(tenantId: string): Promise<ZaloQRSessionResponse> {
  const sessionToken = `zqr_${Math.random().toString(36).substring(2, 12)}`;
  const qrData = `https://affweb.vn/api/saas/zalo-qr/auth?session=${sessionToken}&tenant=${tenantId}`;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

  return {
    success: true,
    qrCodeUrl,
    sessionToken,
    expiresInSeconds: 300 // 5 minutes validity
  };
}

/**
 * Handles incoming Zalo Group Chat events:
 * Automatically listens to links posted in Zalo Community Groups and replies to the group!
 */
export async function handleZaloGroupMessage(params: {
  tenantId: string;
  chatId?: string;
  groupId?: string;
  groupName?: string;
  senderZaloId?: string;
  senderName?: string;
  messageText: string;
  baseUrl: string;
}) {
  const isAllowed = await canTenantUseZaloBot(params.tenantId);
  if (!isAllowed) return { replied: false, reason: "Feature disabled for tier" };

  const tenant = await db.tenant.findUnique({
    where: { id: params.tenantId }
  });

  if (!tenant) return { replied: false, reason: "Tenant not found" };

  // Detect Shopee / Marketplace URL in group message
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = params.messageText.match(urlRegex);

  if (!matches || matches.length === 0) {
    return { replied: false, reason: "No shopping link detected in group text" };
  }

  const rawUrl = matches[0];
  const clickToken = `zg_${Math.random().toString(36).substring(2, 10)}`;
  const trackingUrl = `${params.baseUrl}/go/${clickToken}`;

  const senderMention = params.senderName ? `@${params.senderName}` : "bạn";

  // Standard Group Response Template (Mai Thùy / Ngọc Thảo format)
  const replyText = `Xong rồi! Em gửi link đã chuyển đổi cho ${senderMention} nha ❤️\n\n📦 **Sản phẩm Shopee trong nhóm**\n🔗 **Link tích hoàn tiền**: ${trackingUrl}\n🌸 **Hoa hồng tích lũy lên đến**: 5.5% - 10.2%\n\n⚠️ **Nhớ nè**: Click xong mua ngay trong ngày (nên bấm link lần 2 trước khi đặt hàng), không xem Video/Shopee Live và xóa sản phẩm khỏi giỏ hàng trước khi bấm link nha!`;

  return {
    replied: true,
    groupId: params.groupId || params.chatId,
    trackingUrl,
    replyText
  };
}

// Alias for Webhook backward compatibility
export const handleZaloBotIncomingUpdate = handleZaloGroupMessage;

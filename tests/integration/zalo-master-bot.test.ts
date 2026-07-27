import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { bindZaloGroupToTenant, handleZaloBotIncomingUpdate } from "@/lib/zalo";

describe("1 Central Zalo Bot Integration Test Suite", () => {
  let testTenantId: string;
  let testSlug: string;

  beforeAll(async () => {
    testSlug = `zalo-tenant-${Date.now()}`;
    const tenant = await db.tenant.create({
      data: {
        slug: testSlug,
        name: "Kênh KOC Zalo Master",
        status: "ACTIVE",
        isTrial: false,
        planId: "PRO_199K",
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    testTenantId = tenant.id;
  });

  afterAll(async () => {
    await db.zaloGroupBinding.deleteMany({ where: { tenantId: testTenantId } });
    await db.affiliateClick.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.deleteMany({ where: { id: testTenantId } });
    await db.$disconnect();
  });

  it("binds a Zalo Group Chat ID to a Tenant using bindZaloGroupToTenant", async () => {
    const chatId = "zalo_group_999";
    const binding = await bindZaloGroupToTenant({
      chatId,
      tenantId: testTenantId,
      groupName: "Hội Săn Sale KOC VIP"
    });

    expect(binding.id).toBeDefined();
    expect(binding.chatId).toBe(chatId);
    expect(binding.tenantId).toBe(testTenantId);
  });

  it("handles incoming Shopee link from bound Zalo group and attributes to correct Tenant", async () => {
    const chatId = "zalo_group_999";
    const res = await handleZaloBotIncomingUpdate({
      chatId,
      messageText: "Ad ơi check link này https://shopee.vn/product/123/456 giùm mình với",
      senderName: "Hoàng Nam",
      baseUrl: "https://affweb.vn"
    });

    expect(res.replied).toBe(true);
    expect(res.tenantId).toBe(testTenantId);
    expect(res.replyText).toContain("Kênh KOC Zalo Master");
    expect(res.replyText).toContain("affweb.vn/go/");
  });

  it("supports /link command to bind Zalo Group Chat directly", async () => {
    const newChatId = "zalo_group_888";
    const res = await handleZaloBotIncomingUpdate({
      chatId: newChatId,
      messageText: `/link ${testSlug}`,
      baseUrl: "https://affweb.vn"
    });

    expect(res.replied).toBe(true);
    expect(res.replyText).toContain("Kích hoạt thành công");

    // Verify binding in database
    const bound = await db.zaloGroupBinding.findUnique({
      where: { chatId: newChatId }
    });
    expect(bound?.tenantId).toBe(testTenantId);
  });
});

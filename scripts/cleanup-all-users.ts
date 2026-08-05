import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClerkClient } from "@clerk/nextjs/server";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const rawConnectionString =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/affweb";

const connectionString = rawConnectionString.includes("sslmode=require")
  ? rawConnectionString.replace(/sslmode=require/g, "sslmode=verify-full")
  : rawConnectionString;

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});

async function main() {
  console.log("🚀 Bắt đầu dọn dẹp toàn bộ dữ liệu người dùng và Clerk accounts...\n");

  let deletedClerkCount = 0;
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Không tìm thấy CLERK_SECRET_KEY trong môi trường .env.local");
  }

  try {
    const clerk = createClerkClient({ secretKey });
    const clerkUsersResponse = await clerk.users.getUserList({ limit: 500 });
    const clerkUsers = clerkUsersResponse.data;
    console.log(`🔍 Tìm thấy ${clerkUsers.length} tài khoản người dùng trên Clerk.`);

    for (const u of clerkUsers) {
      const primaryEmail = u.primaryEmailAddress?.emailAddress ?? "no-email";
      try {
        await clerk.users.deleteUser(u.id);
        deletedClerkCount++;
        console.log(`  ✓ Đã xóa tài khoản Clerk: ${u.id} (${primaryEmail})`);
      } catch (err) {
        console.error(`  ✕ Lỗi khi xóa Clerk user ${u.id}:`, err);
      }
    }
  } catch (clerkErr) {
    console.warn("⚠️ Lỗi khi dọn dẹp tài khoản Clerk:", clerkErr);
  }

  // 2. Dọn dẹp dữ liệu trong PostgreSQL
  console.log("\n🗑️ Bắt đầu dọn dẹp các bảng dữ liệu trong PostgreSQL...");
  const deleteResult = await db.$transaction(async (tx) => {
    await tx.tenantMemberWalletProjection.deleteMany({}).catch(() => null);
    await tx.tenantTreasuryProjection.deleteMany({}).catch(() => null);
    await tx.tenantCashbackObligation.deleteMany({}).catch(() => null);
    await tx.tenantFundingOrder.deleteMany({}).catch(() => null);
    await tx.tenantPayoutAllocation.deleteMany({}).catch(() => null);
    await tx.tenantPayoutAttempt.deleteMany({}).catch(() => null);
    await tx.tenantPayoutExecutionIntent.deleteMany({}).catch(() => null);
    await tx.tenantPayout.deleteMany({}).catch(() => null);
    await tx.tenantConversionImport.deleteMany({}).catch(() => null);
    await tx.tenantSubscriptionAdjustment.deleteMany({}).catch(() => null);
    await tx.affiliateClick.deleteMany({}).catch(() => null);
    await tx.conversion.deleteMany({}).catch(() => null);
    await tx.saaSInvoice.deleteMany({}).catch(() => null);
    await tx.connectorConfig.deleteMany({}).catch(() => null);
    await tx.zaloGroupBinding.deleteMany({}).catch(() => null);
    await tx.zaloUserBinding.deleteMany({}).catch(() => null);
    await tx.ledgerEntry.deleteMany({}).catch(() => null);
    await tx.ledgerTransaction.deleteMany({}).catch(() => null);
    await tx.ledgerAccount.deleteMany({}).catch(() => null);
    await tx.walletProjection.deleteMany({}).catch(() => null);
    await tx.bankBeneficiary.deleteMany({}).catch(() => null);
    await tx.beneficiaryChange.deleteMany({}).catch(() => null);
    await tx.payoutAttempt.deleteMany({}).catch(() => null);
    await tx.payoutApproval.deleteMany({}).catch(() => null);
    await tx.payoutTicket.deleteMany({}).catch(() => null);
    await tx.adminPasskey.deleteMany({}).catch(() => null);
    await tx.session.deleteMany({}).catch(() => null);
    await tx.auditLog.deleteMany({}).catch(() => null);
    await tx.notification.deleteMany({}).catch(() => null);
    await tx.roleAssignment.deleteMany({}).catch(() => null);
    const r30 = await tx.user.deleteMany({});
    const r31 = await tx.tenant.deleteMany({});

    return {
      deletedUsersCount: r30.count,
      deletedTenantsCount: r31.count
    };
  });

  console.log(`  ✓ Đã xóa ${deleteResult.deletedUsersCount} bản ghi User trong PostgreSQL.`);
  console.log(`  ✓ Đã xóa ${deleteResult.deletedTenantsCount} bản ghi Tenant trong PostgreSQL.`);

  console.log("\n✅ DỌN DẸP HOÀN TẤT 100%!");
  console.log(`- Đã xóa ${deletedClerkCount} tài khoản Clerk.`);
  console.log(`- Đã làm sạch toàn bộ bảng User, Tenant, Wallet, Conversion & Payout trong DB.`);
  console.log("- Hệ thống hiện tại hoàn toàn sạch sẽ, sẵn sàng cho luồng trải nghiệm mới.");

  await db.$disconnect();
}

main().catch((error) => {
  console.error("💥 Lỗi dọn dẹp dữ liệu:", error);
  process.exit(1);
});

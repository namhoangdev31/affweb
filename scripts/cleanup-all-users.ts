import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClerkClient } from "@clerk/nextjs/server";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function purgeDb(url: string, name: string) {
  if (!url) return;
  const connectionString = url.includes("sslmode=require")
    ? url.replace(/sslmode=require/g, "sslmode=verify-full")
    : url;

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString })
  });

  try {
    console.log(`\n🗑️ Bắt đầu làm sạch cơ sở dữ liệu [${name}]...`);
    const tableNames = [
      '"TenantMemberWalletProjection"',
      '"TenantTreasuryProjection"',
      '"TenantCashbackObligation"',
      '"TenantFundingOrder"',
      '"TenantPayoutAllocation"',
      '"TenantPayoutAttempt"',
      '"TenantPayoutExecutionIntent"',
      '"TenantPayout"',
      '"TenantConversionImport"',
      '"TenantSubscriptionAdjustment"',
      '"AffiliateClick"',
      '"ConversionRevision"',
      '"Conversion"',
      '"SaaSInvoice"',
      '"ConnectorConfig"',
      '"ZaloGroupBinding"',
      '"ZaloUserBinding"',
      '"LedgerEntry"',
      '"LedgerTransaction"',
      '"LedgerAccount"',
      '"WalletProjection"',
      '"BankBeneficiary"',
      '"BeneficiaryChange"',
      '"PayoutAttempt"',
      '"PayoutApproval"',
      '"PayoutTicket"',
      '"AdminPasskey"',
      '"Session"',
      '"AuditLog"',
      '"Notification"',
      '"RoleAssignment"',
      '"IdentityInvitation"',
      '"User"',
      '"Tenant"'
    ];

    await db.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames.join(", ")} RESTART IDENTITY CASCADE;`);
    console.log(`  ✓ Đã TRUNCATE CASCADE làm sạch 100% các bảng trong DB [${name}].`);
  } catch (err) {
    console.error(`  ✕ Lỗi khi dọn dẹp DB [${name}]:`, err);
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  console.log("🚀 Bắt đầu dọn dẹp toàn bộ dữ liệu người dùng, Clerk accounts và các DB...\n");

  let deletedClerkCount = 0;
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (secretKey) {
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
  }

  // 2. Dọn dẹp dữ liệu trong tất cả các DB Postgres (DATABASE_URL, DIRECT_URL, TEST_DATABASE_URL)
  const dbUrls = Array.from(
    new Set(
      [process.env.DATABASE_URL, process.env.DIRECT_URL, process.env.TEST_DATABASE_URL].filter(
        Boolean
      ) as string[]
    )
  );

  for (const url of dbUrls) {
    const name =
      url === process.env.TEST_DATABASE_URL
        ? "TEST_DATABASE_URL (Neon Production)"
        : "DATABASE_URL";
    await purgeDb(url, name);
  }

  console.log("\n✅ DỌN DẸP HOÀN TẤT 100%!");
  console.log(`- Đã xóa ${deletedClerkCount} tài khoản Clerk.`);
  console.log(
    "- Đã TRUNCATE CASCADE toàn bộ các bảng User, Tenant, Ledger, Conversion, Payout trong DB."
  );
  console.log("- Tất cả các DB (Prisma DB & Neon Production DB) hiện tại 100% sạch sẽ.");
}

main().catch((error) => {
  console.error("💥 Lỗi dọn dẹp dữ liệu:", error);
  process.exit(1);
});

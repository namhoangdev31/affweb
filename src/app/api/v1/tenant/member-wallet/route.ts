import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { resolveTenantContext } from "@/modules/tenants/persona";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();
    const context = await resolveTenantContext(user.id);
    const memberTenant = context.memberTenant ?? context.masterTenant;
    const tenantId = memberTenant.id;
    const [wallet, beneficiary, payouts, availableObligations] = await Promise.all([
      db.tenantMemberWalletProjection.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } }
      }),
      db.bankBeneficiary.findFirst({
        where: { userId: user.id, active: true },
        select: { id: true, bankBin: true, accountLast4: true, status: true, changedAt: true }
      }),
      db.tenantPayout.findMany({
        where: { tenantId, userId: user.id, kind: "MEMBER_WITHDRAWAL" },
        select: {
          id: true,
          reference: true,
          amountVnd: true,
          approvalStatus: true,
          settlementStatus: true,
          bankBinSnapshot: true,
          accountLast4Snapshot: true,
          createdAt: true,
          paidAt: true
        },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      db.tenantCashbackObligation.findMany({
        where: { tenantId, userId: user.id, status: "AVAILABLE" },
        select: { fundedVnd: true, reservedVnd: true, paidVnd: true }
      })
    ]);
    const withdrawableVnd = availableObligations.reduce(
      (total, obligation) =>
        total + obligation.fundedVnd - obligation.reservedVnd - obligation.paidVnd,
      0n
    );
    return Response.json(
      jsonSafe({
        tenant: {
          name: memberTenant.name,
          slug: memberTenant.slug,
          brandColor: memberTenant.brandColor
        },
        wallet: wallet ?? {
          pendingFundingVnd: 0n,
          availableVnd: 0n,
          reservedVnd: 0n,
          paidVnd: 0n,
          recoveryVnd: 0n
        },
        withdrawableVnd,
        beneficiary,
        payouts
      }),
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

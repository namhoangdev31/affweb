import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { requireTenantMasterContext } from "@/modules/tenants/persona";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();
    const context = await requireTenantMasterContext(user.id);
    const tenantId = context.ownedTenant!.id;
    const [treasury, pendingFunding, fundingOrders, payouts] = await Promise.all([
      db.tenantTreasuryProjection.findUnique({ where: { tenantId } }),
      db.tenantCashbackObligation.aggregate({
        where: { tenantId, status: "PENDING_FUNDING" },
        _sum: { amountVnd: true, fundedVnd: true, recoveredVnd: true },
        _count: true
      }),
      db.tenantFundingOrder.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      db.tenantPayout.findMany({
        where: { tenantId, kind: "TREASURY_WITHDRAWAL" },
        select: {
          id: true,
          reference: true,
          amountVnd: true,
          status: true,
          bankBinSnapshot: true,
          accountLast4Snapshot: true,
          createdAt: true,
          paidAt: true
        },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    ]);
    const pendingFundingVnd =
      (pendingFunding._sum.amountVnd ?? 0n) -
      (pendingFunding._sum.fundedVnd ?? 0n) -
      (pendingFunding._sum.recoveredVnd ?? 0n);
    return Response.json(
      jsonSafe({
        tenant: {
          id: context.ownedTenant!.id,
          name: context.ownedTenant!.name,
          slug: context.ownedTenant!.slug
        },
        treasury: treasury ?? {
          availableVnd: 0n,
          reservedVnd: 0n,
          paidVnd: 0n,
          withdrawnVnd: 0n
        },
        pendingFunding: { count: pendingFunding._count, amountVnd: pendingFundingVnd },
        fundingOrders,
        payouts
      }),
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

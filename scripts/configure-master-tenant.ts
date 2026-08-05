import { Prisma } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { loadServerEnv } from "../src/lib/env";

const masterTenantId = loadServerEnv().MASTER_TENANT_ID;
if (!masterTenantId) throw new Error("MASTER_TENANT_ID is required.");
if (process.env.MASTER_TENANT_BACKFILL_CONFIRM !== masterTenantId) {
  throw new Error("Set MASTER_TENANT_BACKFILL_CONFIRM to the exact MASTER_TENANT_ID.");
}

const result = await db.$transaction(
  async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${masterTenantId} FOR UPDATE`;
    const master = await tx.tenant.findUnique({ where: { id: masterTenantId } });
    if (!master?.ownerUserId) throw new Error("Master tenant must exist and have an owner.");
    if (!["TRIAL", "ACTIVE"].includes(master.status)) {
      throw new Error("Master tenant must be active before backfill.");
    }
    await tx.tenant.updateMany({
      where: { id: { not: masterTenantId } },
      data: { kind: "STANDARD" }
    });
    await tx.tenant.update({ where: { id: masterTenantId }, data: { kind: "MASTER" } });

    const childOwners = await tx.tenant.findMany({
      where: { id: { not: masterTenantId }, ownerUserId: { not: null } },
      select: { ownerUserId: true }
    });
    const ownerIds = childOwners.flatMap((tenant) =>
      tenant.ownerUserId ? [tenant.ownerUserId] : []
    );
    const ownerUpdate = ownerIds.length
      ? await tx.user.updateMany({
          where: { id: { in: ownerIds } },
          data: { tenantId: masterTenantId }
        })
      : { count: 0 };
    const baselineUpdate = await tx.user.updateMany({
      where: { tenantId: null, id: { not: master.ownerUserId } },
      data: { tenantId: masterTenantId }
    });
    await tx.tenantTreasuryProjection.upsert({
      where: { tenantId: masterTenantId },
      create: { tenantId: masterTenantId },
      update: {}
    });
    await tx.auditLog.create({
      data: {
        actorUserId: master.ownerUserId,
        action: "tenant.master.configured",
        entityType: "Tenant",
        entityId: masterTenantId,
        metadata: {
          childOwnersMoved: ownerUpdate.count,
          baselineMembersMoved: baselineUpdate.count
        }
      }
    });
    return { childOwnersMoved: ownerUpdate.count, baselineMembersMoved: baselineUpdate.count };
  },
  { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
);

console.info(JSON.stringify({ masterTenantId, ...result }));
await db.$disconnect();

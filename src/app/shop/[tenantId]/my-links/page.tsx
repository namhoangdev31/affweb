import { LinksWorkspace, type LinkHistoryItem } from "@/components/links-workspace";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { paginationPage } from "@/lib/pagination";
import { requireTenantMasterContext } from "@/modules/tenants/persona";

const PAGE_SIZE = 20;

function productFromSnapshot(value: unknown): LinkHistoryItem["product"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const product = (value as { product?: unknown }).product;
  if (!product || typeof product !== "object" || Array.isArray(product)) return null;
  const record = product as Record<string, unknown>;
  if (typeof record.title !== "string") return null;
  return {
    title: record.title,
    shopName: typeof record.shopName === "string" ? record.shopName : null,
    imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : null,
    priceVnd: typeof record.priceVnd === "string" ? record.priceVnd : null
  };
}

function taxBpsFromSnapshot(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const taxBps = (value as Record<string, unknown>).withholdingTaxBps;
  return typeof taxBps === "number" && Number.isInteger(taxBps) ? taxBps : 0;
}

export default async function ShopMyLinksPage({
  params,
  searchParams
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const { tenantId: paramId } = await params;
  const user = await requireUser();
  const tenantObj = await db.tenant.findFirst({
    where: { OR: [{ id: paramId }, { slug: paramId.toLowerCase() }] }
  });
  const context = await requireTenantMasterContext(user.id, tenantObj?.id);
  const tenant = context.ownedTenant!;

  const searchP = await searchParams;
  const [campaigns, totalClicks] = await Promise.all([
    db.campaign.findMany({
      where: { active: true, merchant: { active: true } },
      include: { merchant: { select: { name: true, platform: true } } },
      orderBy: { name: "asc" }
    }),
    db.affiliateClick.count({ where: { userId: user.id, tenantId: tenant.id } })
  ]);

  const currentPage = paginationPage(searchP.page, totalClicks, PAGE_SIZE);
  const clicks = await db.affiliateClick.findMany({
    where: { userId: user.id, tenantId: tenant.id },
    include: { attribution: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Link cá nhân được tạo trong Kênh{" "}
          <strong className="text-foreground">/{tenant.slug}</strong>
        </p>
        <h1 className="display-type mt-1 text-4xl">Link cá nhân.</h1>
      </div>

      <LinksWorkspace
        campaigns={campaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          merchantName: campaign.merchant.name,
          platform: campaign.merchant.platform
        }))}
        history={clicks.map((click) => ({
          id: click.id,
          redirectUrl: `/go/${click.clickToken}`,
          originUrl: click.originUrl,
          platform: click.platform,
          targetType: click.targetType,
          createdAt: click.createdAt.toISOString(),
          clickedAt: click.clickedAt?.toISOString() ?? null,
          shareBps: click.attribution?.shareBps ?? 0,
          withholdingTaxBps: taxBpsFromSnapshot(click.attribution?.snapshot),
          product: productFromSnapshot(click.productSnapshot)
        }))}
        historyActive={searchP.tab === "history" || searchP.page !== undefined}
        currentPage={currentPage}
        totalHistory={totalClicks}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}

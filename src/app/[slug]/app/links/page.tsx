import { LinksWorkspace, type LinkHistoryItem } from "@/components/links-workspace";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { paginationPage } from "@/lib/pagination";
import { requireTenantUserContext } from "@/modules/tenants/persona";

const PAGE_SIZE = 20;

function product(value: unknown): LinkHistoryItem["product"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = (value as { product?: Record<string, unknown> }).product;
  if (!item || typeof item.title !== "string") return null;
  return {
    title: item.title,
    shopName: typeof item.shopName === "string" ? item.shopName : null,
    imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
    priceVnd: typeof item.priceVnd === "string" ? item.priceVnd : null
  };
}

export default async function TenantLinksPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const query = await searchParams;
  const context = await requireTenantUserContext(user.id, slug);
  const tenantId = context.memberTenant!.id;
  const [campaigns, total] = await Promise.all([
    db.campaign.findMany({
      where: { active: true, merchant: { active: true } },
      include: { merchant: { select: { name: true, platform: true } } },
      orderBy: { name: "asc" }
    }),
    db.affiliateClick.count({ where: { tenantId, userId: user.id } })
  ]);
  const currentPage = paginationPage(query.page, total, PAGE_SIZE);
  const clicks = await db.affiliateClick.findMany({
    where: { tenantId, userId: user.id },
    include: { attribution: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Affiliate ID và tỷ lệ của tenant được snapshot tại link time.
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Link tenant</h1>
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
          withholdingTaxBps: 1000,
          product: product(click.productSnapshot)
        }))}
        historyActive={query.tab === "history" || query.page !== undefined}
        currentPage={currentPage}
        totalHistory={total}
        pageSize={PAGE_SIZE}
        pathname={`/${slug}/app/links`}
      />
    </div>
  );
}

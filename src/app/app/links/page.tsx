import { LinksWorkspace, type LinkHistoryItem } from "@/components/links-workspace";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";

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

export default async function LinksPage() {
  const user = await requireUser();
  const [campaigns, clicks] = await Promise.all([
    db.campaign.findMany({
      where: { active: true, merchant: { active: true } },
      include: { merchant: { select: { name: true, platform: true } } },
      orderBy: { name: "asc" }
    }),
    db.affiliateClick.findMany({
      where: { userId: user.id },
      include: { attribution: true },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Tỷ lệ và nguồn Affiliate được snapshot ngay lúc tạo
        </p>
        <h1 className="display-type mt-1 text-4xl">Link cashback.</h1>
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
      />
    </div>
  );
}

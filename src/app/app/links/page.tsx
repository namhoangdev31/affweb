import { LinkBuilder } from "@/components/link-builder";
import { db } from "@/lib/db";

export default async function LinksPage() {
  const campaigns = await db.campaign.findMany({
    where: { active: true, merchant: { active: true } },
    include: { merchant: { select: { name: true, platform: true } } },
    orderBy: { name: "asc" }
  });
  return (
    <div>
      <p className="text-sm text-muted-foreground">Attribution được snapshot ngay lúc tạo</p>
      <h1 className="display-type mt-1 text-4xl">Tạo link cashback.</h1>
      <div className="mt-8">
        <LinkBuilder
          campaigns={campaigns.map((campaign) => ({
            id: campaign.id,
            name: campaign.name,
            merchantName: campaign.merchant.name,
            platform: campaign.merchant.platform
          }))}
        />
      </div>
    </div>
  );
}

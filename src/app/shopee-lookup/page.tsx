import type { Metadata } from "next";
import { ShopeeProductLookup } from "@/components/shopee-product-lookup";
import { fetchShopeeProductData } from "@/lib/shopee-product";
import { formatVnd } from "@/lib/utils";

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ url?: string }>;
}): Promise<Metadata> {
  const { url } = await searchParams;
  if (!url) {
    return {
      title: "Tra cứu hoa hồng Shopee | Affiliate Cashback",
      description:
        "Tra cứu tỷ lệ % hoa hồng Seller & Shopee, giá bán, lượt bán và tính hoa hồng dự kiến cho bất kỳ sản phẩm Shopee nào."
    };
  }

  const data = await fetchShopeeProductData(url);
  if (!data) {
    return {
      title: "Tra cứu hoa hồng Shopee | Affiliate Cashback",
      description: "Tra cứu tỷ lệ % hoa hồng Seller & Shopee cho sản phẩm Shopee."
    };
  }

  const title = `${data.product.title} | Hoa hồng ${data.commission.totalPercent}% (≈ ${formatVnd(BigInt(data.commission.totalVnd))})`;
  const description = `Giá bán ${formatVnd(BigInt(data.product.priceVnd))} - ${data.product.salesCount} đã bán tại ${data.product.shopName}. Hoa hồng Seller: ${data.commission.sellerPercent}%, Shopee: ${data.commission.shopeePercent}%.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(data.product.imageUrl ? { images: [{ url: data.product.imageUrl }] } : {})
    }
  };
}

export default async function ShopeeLookupPage({
  searchParams
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  const initialData = url ? await fetchShopeeProductData(url) : null;

  return (
    <div className="min-h-screen bg-[#0b0e0c] px-4 py-8 sm:px-6 lg:px-8">
      <ShopeeProductLookup initialUrl={url ?? ""} initialData={initialData} />
    </div>
  );
}

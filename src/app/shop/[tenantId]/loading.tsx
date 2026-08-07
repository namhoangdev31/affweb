import { LoadingScreen } from "@/components/loading-screen";

export default function ShopTenantDashboardLoading() {
  return (
    <LoadingScreen
      title="Đang tải dữ liệu Kênh KOC..."
      subtitle="Đang cập nhật số dư, thành viên và đơn hàng"
    />
  );
}

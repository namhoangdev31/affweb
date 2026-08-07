import { LoadingScreen } from "@/components/loading-screen";

export default function TenantSmartRouteLoading() {
  return (
    <LoadingScreen
      title="Đang xác thực tài khoản..."
      subtitle="Đang điều hướng đến Cổng Quản Lý phù hợp"
    />
  );
}

import { LoadingScreen } from "@/components/loading-screen";

export default function AdminDashboardLoading() {
  return (
    <LoadingScreen
      title="Đang tải Bảng Điều Khiển..."
      subtitle="Đang lấy thông số hệ thống và báo cáo"
    />
  );
}

import { LegalPage } from "@/components/legal-page";

export default function CashbackPolicyPage() {
  return (
    <LegalPage title="Chính sách cashback" updated="24/07/2026">
      <h2>Trạng thái số dư</h2>
      <p>
        Chờ xử lý là tiền chờ đối tác đối soát xác minh; Khả dụng là số dư có thể tạo yêu cầu rút
        tiền; Đang xử lý là số dư đang được xử lý rút; Đã nhận là tiền đã thanh toán hoàn tất.
      </p>
      <h2>Tỷ lệ chia</h2>
      <p>
        Tỷ lệ hoàn tiền được ghi nhận cố định ngay tại thời điểm bạn bấm vào link mua hàng theo thứ
        tự ưu tiên cấu hình của hệ thống.
      </p>
      <h2>Điều chỉnh và từ chối</h2>
      <p>
        Đơn hủy, hoàn, gian lận hoặc sai lệch dữ liệu đối tác có thể tạo bút toán đối ứng. Lịch sử
        sổ kế toán không bị sửa hoặc xóa.
      </p>
      <h2>Quy định rút tiền</h2>
      <p>
        Hạn mức rút tiền tối thiểu 100.000 ₫, tối đa 500.000 ₫ cho mỗi yêu cầu/ngày. Mọi yêu cầu rút
        tiền đều được kiểm duyệt bảo đảm an toàn.
      </p>
    </LegalPage>
  );
}

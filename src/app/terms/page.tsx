import { LegalPage } from "@/components/legal-page";

export default function TermsPage() {
  return (
    <LegalPage title="Điều khoản sử dụng" updated="24/07/2026">
      <h2>1. Phạm vi dịch vụ</h2>
      <p>
        Hoàn Tiền cung cấp công cụ tạo liên kết affiliate, theo dõi conversion và chia lại một phần
        hoa hồng đã được đối tác xác minh.
      </p>
      <h2>2. Số tiền ước tính</h2>
      <p>
        Mọi cashback ở trạng thái chờ chỉ là ước tính. Giá trị cuối cùng phụ thuộc dữ liệu xác minh,
        hủy/hoàn đơn và điều kiện của đối tác.
      </p>
      <h2>3. Sử dụng hợp lệ</h2>
      <p>
        Không tự mua gian lận, giả mạo click, can thiệp attribution, tạo nhiều tài khoản hoặc sử
        dụng nguồn traffic bị cấm.
      </p>
      <h2>4. Khiếu nại</h2>
      <p>
        Khiếu nại cần mã đơn, thời điểm mua và bằng chứng không chứa mật khẩu/token. Không gửi giấy
        tờ tùy thân qua ứng dụng.
      </p>
    </LegalPage>
  );
}

import { LegalPage } from "@/components/legal-page";

export default function CashbackPolicyPage() {
  return (
    <LegalPage title="Chính sách cashback" updated="24/07/2026">
      <h2>Trạng thái số dư</h2>
      <p>
        Pending là tiền chờ đối tác xác minh; available có thể tạo payout; reserved đã khóa cho
        ticket; paid đã hoàn tất qua payOS.
      </p>
      <h2>Tỷ lệ chia</h2>
      <p>
        Tỷ lệ được snapshot lúc tạo click theo ưu tiên user × campaign, user × merchant, user
        global, merchant default rồi system default.
      </p>
      <h2>Điều chỉnh và từ chối</h2>
      <p>
        Đơn hủy, hoàn, gian lận hoặc provider correction có thể tạo bút toán đối ứng. Ledger cũ
        không bị sửa hoặc xóa.
      </p>
      <h2>Payout beta</h2>
      <p>
        Tối thiểu 100.000 ₫, tối đa 500.000 ₫ mỗi ticket/ngày. Mọi payout cần reviewer và approver
        khác nhau.
      </p>
    </LegalPage>
  );
}

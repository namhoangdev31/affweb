import { LegalPage } from "@/components/legal-page";

export default function PrivacyPage() {
  return (
    <LegalPage title="Chính sách quyền riêng tư" updated="24/07/2026">
      <h2>Dữ liệu chúng tôi xử lý</h2>
      <p>
        Tài khoản, click được băm định danh mạng, conversion, ledger, thông báo và thông tin người
        thụ hưởng đã mã hóa.
      </p>
      <h2>Dữ liệu không lưu</h2>
      <p>
        Ứng dụng không lưu cookie Shopee, credential affiliate, secret payout hoặc ảnh giấy tờ KYC
        trong cơ sở dữ liệu.
      </p>
      <h2>Bảo vệ dữ liệu</h2>
      <p>
        Số tài khoản được mã hóa AES-256-GCM; giao diện chỉ hiển thị ngân hàng và bốn số cuối. Raw
        evidence tài chính được lưu immutable.
      </p>
      <h2>Quyền của bạn</h2>
      <p>
        Bạn có thể yêu cầu xem, chỉnh sửa hoặc đóng tài khoản, tùy nghĩa vụ lưu trữ tài chính và
        pháp luật áp dụng.
      </p>
    </LegalPage>
  );
}

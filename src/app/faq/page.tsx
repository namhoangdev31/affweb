import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = { title: "Hỏi đáp" };

const faqs = [
  [
    "Cashback có được đảm bảo không?",
    "Số tiền hiển thị ban đầu là mức dự kiến. Tiền hoàn sẽ chuyển thành khả dụng ngay sau khi sàn đối tác xác nhận đơn hàng thành công và qua thời gian chờ bảo vệ an toàn."
  ],
  [
    "Bao lâu tôi thấy đơn?",
    "Thông thường hệ thống ghi nhận đơn trong vòng 10–30 phút. Một số trường hợp sàn cập nhật chậm hơn, hệ thống sẽ tự động đồng bộ ngay khi nhận dữ liệu từ đối tác."
  ],
  [
    "Khi nào có thể rút?",
    "Bạn có thể tạo yêu cầu rút tiền khi số dư khả dụng đạt từ 100.000 ₫ trở lên."
  ],
  [
    "Vì sao đổi tài khoản ngân hàng tạm thời không thể rút tiền?",
    "Đây là tính năng bảo mật tuyệt đối nhằm bảo vệ tài sản của bạn tránh bị kẻ gian chiếm đoạt tài khoản. Yêu cầu rút tiền sẽ mở lại tự động sau thời gian bảo vệ an toàn."
  ],
  [
    "ShopeeFood có được tích điểm hoàn tiền không?",
    "Hệ thống hỗ trợ tạo link và ghi nhận đơn ShopeeFood hoàn toàn tự động khi phát sinh đơn hàng thành công."
  ]
];

export default function FaqPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl px-5 py-20">
        <h1 className="display-type text-6xl">Hỏi thẳng, đáp rõ.</h1>
        <div className="mt-14 divide-y border-y">
          {faqs.map(([question, answer]) => (
            <article key={question} className="py-7">
              <h2 className="text-lg font-semibold">{question}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{answer}</p>
            </article>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}

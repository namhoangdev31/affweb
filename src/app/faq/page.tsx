import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = { title: "Hỏi đáp" };

const faqs = [
  [
    "Cashback có được đảm bảo không?",
    "Không. Số tiền ban đầu là ước tính. Cashback chỉ trở thành khả dụng sau khi đối tác xác minh và qua safety hold."
  ],
  [
    "Bao lâu tôi thấy đơn?",
    "Thông thường 10–30 phút, nhưng một số đối tác có thể chậm hơn. Connector lag quá 30 phút sẽ tự đóng băng release mới."
  ],
  [
    "Khi nào có thể rút?",
    "Khi số dư khả dụng từ 100.000 ₫. Beta giới hạn tối đa 500.000 ₫ mỗi ticket và mỗi người mỗi ngày."
  ],
  [
    "Vì sao đổi tài khoản ngân hàng bị khóa 72 giờ?",
    "Đây là khoảng bảo vệ chống chiếm đoạt tài khoản. Không ai, kể cả admin, có thể bỏ qua mà không để lại audit."
  ],
  [
    "ShopeeFood đã có cashback chưa?",
    "Link và attribution ShopeeFood đã tách riêng. Cashback chỉ bật khi round-trip click/SubID → order trên production đạt yêu cầu."
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

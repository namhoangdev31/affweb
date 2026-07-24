import type { Metadata } from "next";
import { DealBrowser } from "@/components/deal-browser";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "Ưu đãi cashback",
  description: "Tìm deal và mức cashback dự kiến từ các đối tác."
};

export default function DealsPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-[#8b6d21]">
          Deal đang mở
        </p>
        <h1 className="display-type mt-4 text-6xl">Tìm món đáng mua.</h1>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Giá và cashback là dữ liệu ước tính tại lần đồng bộ gần nhất. Hãy kiểm tra lại trên trang
          đối tác trước khi thanh toán.
        </p>
        <div className="mt-10">
          <DealBrowser />
        </div>
      </section>
    </PublicShell>
  );
}

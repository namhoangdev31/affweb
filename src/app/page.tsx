import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  Link2,
  ReceiptText,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const partners = ["Shopee", "ShopeeFood", "AccessTrade"];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="grain relative overflow-hidden">
          <div className="mx-auto grid min-h-[720px] max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[1.08fr_.92fr] lg:px-8">
            <div>
              <Badge variant="secondary" className="mb-7 gap-2 rounded-full px-3 py-1.5">
                <Sparkles className="size-3.5" /> Nền tảng tích điểm & hoàn tiền mua sắm
              </Badge>
              <h1 className="display-type max-w-4xl text-6xl leading-[.94] sm:text-7xl lg:text-[5.7rem]">
                Mua như cũ.
                <br />
                <span className="text-[#8b6d21]">Nhận lại nhiều hơn.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
                Bắt đầu từ một liên kết. Chúng tôi theo dõi hoa hồng, chia lại phần của bạn và hiển
                thị từng bước cho đến khi tiền về tài khoản.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button size="lg" asChild className="rounded-full px-7">
                  <Link href="/login">
                    Tạo link đầu tiên <ArrowRight />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="rounded-full px-7">
                  <Link href="#cach-hoat-dong">Xem cách hoạt động</Link>
                </Button>
              </div>
              <div className="mt-12 flex flex-wrap gap-x-7 gap-y-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" /> Sổ kế toán minh bạch
                </span>
                <span className="flex items-center gap-2">
                  <BadgeCheck className="size-4 text-primary" /> Rút tiền duyệt an toàn
                </span>
                <span className="flex items-center gap-2">
                  <Clock3 className="size-4 text-primary" /> Theo dõi trạng thái
                </span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-lg">
              <div className="absolute -inset-10 rounded-full bg-[#d9bd68]/20 blur-3xl" />
              <Card className="relative overflow-hidden border-[#a78d4b]/30 bg-[#173b31] text-white shadow-[0_35px_80px_-30px_rgba(15,43,35,.65)]">
                <CardContent className="p-7 sm:p-9">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-white/60">Cashback đang theo dõi</p>
                      <p className="mt-2 text-4xl font-semibold tracking-tight">328.450 ₫</p>
                    </div>
                    <CircleDollarSign className="size-9 text-[#e2c873]" />
                  </div>
                  <div className="mt-10 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/8 p-4">
                      <p className="text-xs text-white/55">Khả dụng</p>
                      <p className="mt-1 text-lg font-medium">186.200 ₫</p>
                    </div>
                    <div className="rounded-2xl bg-white/8 p-4">
                      <p className="text-xs text-white/55">Chờ xác minh</p>
                      <p className="mt-1 text-lg font-medium">142.250 ₫</p>
                    </div>
                  </div>
                  <div className="mt-8 space-y-3">
                    {[
                      ["Shopee", "Tai nghe không dây", "+ 48.600 ₫", "Đã duyệt"],
                      ["ShopeeFood", "Bữa trưa thứ Sáu", "+ 21.350 ₫", "Đang chờ"],
                      ["Shopee", "Đồ gia dụng", "+ 116.250 ₫", "Khả dụng"]
                    ].map(([brand, name, amount, status]) => (
                      <div
                        key={name}
                        className="flex items-center gap-3 rounded-2xl bg-[#0f2d25] p-3.5"
                      >
                        <div className="grid size-10 place-items-center rounded-xl bg-[#f3dd98] text-sm font-bold text-[#173b31]">
                          {brand?.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="text-xs text-white/50">
                            {brand} · {status}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-[#ecd88f]">{amount}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-6 text-xs leading-5 text-white/45">
                    Minh họa. Cashback dự kiến có thể thay đổi sau khi đối tác xác minh đơn.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="border-y bg-card/70">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-7 px-5 py-7 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">
              Kết nối hệ sinh thái
            </p>
            {partners.map((partner) => (
              <span
                key={partner}
                className="text-lg font-semibold tracking-tight text-foreground/65"
              >
                {partner}
              </span>
            ))}
          </div>
        </section>

        <section id="cach-hoat-dong" className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-[#8b6d21]">
              Ba bước rõ ràng
            </p>
            <h2 className="display-type mt-4 text-5xl sm:text-6xl">Từ cú nhấp đến tiền hoàn.</h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              [
                Link2,
                "01",
                "Tạo liên kết",
                "Dán liên kết sản phẩm Shopee, Lazada hoặc ưu đãi. Hệ thống tự động tạo link hoàn tiền cá nhân cho bạn."
              ],
              [
                ReceiptText,
                "02",
                "Mua và theo dõi",
                "Mua bình thường. Click, đơn hàng và hoa hồng được đối chiếu từ nhiều nguồn."
              ],
              [
                CircleDollarSign,
                "03",
                "Nhận cashback",
                "Sau khi sàn đối tác xác nhận đơn thành công, tiền hoàn sẽ chuyển sang khả dụng để bạn rút về ngân hàng."
              ]
            ].map(([Icon, number, title, body]) => {
              const StepIcon = Icon as typeof Link2;
              return (
                <Card key={String(number)} className="border-black/8 bg-card/80">
                  <CardContent className="p-7">
                    <div className="flex items-center justify-between">
                      <StepIcon className="size-7 text-primary" />
                      <span className="display-type text-3xl text-[#b59a53]">{String(number)}</span>
                    </div>
                    <h3 className="mt-10 text-xl font-semibold">{String(title)}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{String(body)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="bg-[#e8dfc8]">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-2 lg:px-8 lg:py-28">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[.18em] text-[#71591d]">
                Có kiểm soát, không mập mờ
              </p>
              <h2 className="display-type mt-4 text-5xl leading-none">
                Mỗi con số đều có đường đi.
              </h2>
            </div>
            <div className="grid gap-6">
              {[
                [
                  "Tỷ lệ hoàn tiền được cố định khi tạo link",
                  "Thay đổi tỷ lệ sau này không làm ảnh hưởng đến hoa hồng đã ghi nhận của link cũ."
                ],
                [
                  "Hệ thống kế toán tiêu chuẩn",
                  "Số dư hiển thị được kiểm soát chặt chẽ và ghi nhận chính xác theo từng giao dịch."
                ],
                [
                  "Quy trình chi trả an toàn 2 lớp",
                  "Hệ thống tự động kiểm tra và bảo mật tuyệt đối cho mọi yêu cầu rút tiền của bạn."
                ]
              ].map(([title, body]) => (
                <div key={title} className="border-b border-black/15 pb-6">
                  <h3 className="flex items-center gap-3 text-lg font-semibold">
                    <BadgeCheck className="size-5" /> {title}
                  </h3>
                  <p className="mt-2 pl-8 text-sm leading-6 text-foreground/65">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-24 text-center lg:py-32">
          <h2 className="display-type text-5xl sm:text-6xl">Đừng để hoa hồng trôi qua.</h2>
          <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
            Trải nghiệm mua sắm thông minh và tích lũy hoàn tiền ngay hôm nay.
          </p>
          <Button size="lg" asChild className="mt-8 rounded-full px-8">
            <Link href="/login">
              Bắt đầu ngay <ArrowRight />
            </Link>
          </Button>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

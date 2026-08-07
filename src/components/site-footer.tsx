import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t bg-[#102c24] text-[#f7f1df]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.5fr_1fr_1fr] lg:px-8">
        <div>
          <p className="display-type text-3xl">Mỗi đơn hàng, một phần giá trị quay về.</p>
          <p className="mt-4 max-w-md text-sm leading-6 text-[#d7ddda]">
            Nền tảng cashback minh bạch cho người mua Việt Nam. Số tiền hiển thị trước xác minh chỉ
            là ước tính và phụ thuộc vào đối tác affiliate.
          </p>
        </div>
        <div className="grid content-start gap-3 text-sm">
          <p className="font-semibold text-[#e6cd83]">Khám phá</p>
          <Link href="/deals">Ưu đãi</Link>
          <Link href="/partners">Đối tác</Link>
          <Link href="/faq">Hỏi đáp</Link>
        </div>
        <div className="grid content-start gap-3 text-sm">
          <p className="font-semibold text-[#e6cd83]">Pháp lý & Hệ thống</p>
          <Link href="/terms">Điều khoản</Link>
          <Link href="/privacy">Quyền riêng tư</Link>
          <Link href="/cashback-policy">Chính sách cashback</Link>
          <Link
            href="/sign-in"
            className="text-xs text-[#aab9b3] hover:text-[#e6cd83] transition-colors"
          >
            Đăng nhập Quản trị Owner
          </Link>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-[#aab9b3] flex flex-col md:flex-row items-center justify-between gap-3 max-w-7xl mx-auto lg:px-8">
        <p>
          © {new Date().getFullYear()} Hoàn Tiền. Không liên kết chính thức với các sàn được nêu.
        </p>
        <Link href="/sign-in" className="hover:text-[#e6cd83] transition-colors">
          Hệ thống Owner
        </Link>
      </div>
    </footer>
  );
}

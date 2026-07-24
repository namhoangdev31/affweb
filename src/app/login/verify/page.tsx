import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerifyPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <MailCheck className="mx-auto size-12 text-primary" />
        <h1 className="display-type mt-5 text-5xl">Kiểm tra hộp thư.</h1>
        <p className="mt-4 text-muted-foreground">
          Liên kết đăng nhập chỉ dùng một lần và sẽ hết hạn.
        </p>
        <Button asChild variant="outline" className="mt-7">
          <Link href="/">Về trang chủ</Link>
        </Button>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <p className="text-sm font-semibold text-[#8b6d21]">404</p>
        <h1 className="display-type mt-3 text-6xl">Không tìm thấy trang.</h1>
        <Button asChild className="mt-7">
          <Link href="/">Về trang chủ</Link>
        </Button>
      </div>
    </main>
  );
}

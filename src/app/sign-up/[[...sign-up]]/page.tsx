import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { ClerkSessionSanitizer } from "@/components/clerk-session-sanitizer";

export const metadata = { title: "Đăng ký", robots: { index: false, follow: false } };

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f3ec] px-5 py-12">
      <ClerkSessionSanitizer />
      <div className="flex flex-col items-center">
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
        <p className="mt-6 text-center text-sm text-slate-600">
          Đã có tài khoản?{" "}
          <Link
            href="/sign-in"
            className="font-semibold text-emerald-900 underline hover:text-emerald-800"
          >
            Đăng nhập ngay
          </Link>
        </p>
      </div>
    </main>
  );
}

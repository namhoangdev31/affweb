import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { ClerkSessionSanitizer } from "@/components/clerk-session-sanitizer";

export const metadata = { title: "Đăng nhập", robots: { index: false, follow: false } };

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f3ec] px-5 py-12">
      <ClerkSessionSanitizer />
      <div className="flex flex-col items-center">
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
        <p className="mt-6 text-center text-sm text-slate-600">
          Chưa có tài khoản?{" "}
          <Link
            href="/sign-up"
            className="font-semibold text-emerald-900 underline hover:text-emerald-800"
          >
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </main>
  );
}

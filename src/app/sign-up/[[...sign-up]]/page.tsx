import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { ClerkSessionSanitizer } from "@/components/clerk-session-sanitizer";

export const metadata = { title: "Đăng ký", robots: { index: false, follow: false } };

export default function SignUpPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground overflow-hidden transition-colors">
      {/* Glow background effects */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[36rem] rounded-full bg-emerald-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 -translate-x-1/2 size-[30rem] rounded-full bg-teal-500/10 blur-[100px]" />

      <ClerkSessionSanitizer />
      <div className="relative z-10 flex flex-col items-center w-full max-w-md">
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/tenant" />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Đã có tài khoản?{" "}
          <Link
            href="/sign-in"
            className="font-bold text-emerald-600 dark:text-emerald-400 underline decoration-emerald-500/40 underline-offset-4 hover:text-emerald-700 dark:hover:text-emerald-300 transition-all"
          >
            Đăng nhập ngay
          </Link>
        </p>
      </div>
    </main>
  );
}

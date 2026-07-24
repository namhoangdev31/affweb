import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Đăng ký", robots: { index: false, follow: false } };

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f3ec] px-5 py-12">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </main>
  );
}

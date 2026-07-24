import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Đăng nhập", robots: { index: false, follow: false } };

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f3ec] px-5 py-12">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </main>
  );
}

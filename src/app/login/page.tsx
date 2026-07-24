import Image from "next/image";
import Link from "next/link";
import { Mail } from "lucide-react";
import { signIn } from "@/auth";
import { authCapabilities } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Đăng nhập", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="items-center text-center">
          <Link href="/" aria-label="Trang chủ">
            <Image src="/brand-mark.svg" width={54} height={54} alt="" />
          </Link>
          <CardTitle className="display-type pt-3 text-4xl">Chào bạn trở lại.</CardTitle>
          <CardDescription>Beta đang giới hạn theo danh sách lời mời.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/app" });
            }}
          >
            <Button className="w-full" size="lg" type="submit" disabled={!authCapabilities.google}>
              Tiếp tục với Google
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            hoặc dùng magic link
            <span className="h-px flex-1 bg-border" />
          </div>
          <form
            className="space-y-3"
            action={async (formData) => {
              "use server";
              await signIn("resend", {
                email: String(formData.get("email") ?? ""),
                redirectTo: "/app"
              });
            }}
          >
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="email" name="email" type="email" required className="pl-10" />
            </div>
            <Button
              className="w-full"
              variant="outline"
              type="submit"
              disabled={!authCapabilities.email}
            >
              Gửi liên kết đăng nhập
            </Button>
          </form>
          <p className="pt-3 text-center text-xs leading-5 text-muted-foreground">
            Tiếp tục đồng nghĩa bạn đồng ý với{" "}
            <Link className="underline" href="/terms">
              điều khoản
            </Link>{" "}
            và{" "}
            <Link className="underline" href="/privacy">
              quyền riêng tư
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

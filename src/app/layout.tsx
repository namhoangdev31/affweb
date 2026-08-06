import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";
import "@/app/globals.css";
import { Providers } from "@/components/providers";
import { loadServerEnv } from "@/lib/env";

const baseUrl = new URL(loadServerEnv().APP_BASE_URL);

export const metadata: Metadata = {
  metadataBase: baseUrl,
  title: {
    default: "Hoàn Tiền — Cashback khi mua sắm online",
    template: "%s | Hoàn Tiền"
  },
  description:
    "Tạo liên kết mua sắm Shopee, theo dõi đơn và nhận lại một phần hoa hồng khi conversion được xác minh.",
  applicationName: "Hoàn Tiền",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "Hoàn Tiền",
    title: "Hoàn Tiền — Mua như cũ, nhận lại nhiều hơn",
    description: "Cashback minh bạch cho những đơn hàng bạn vẫn mua mỗi ngày."
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Hoàn Tiền", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#102c24",
  colorScheme: "light"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await headers();
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <ClerkProvider
          dynamic
          localization={{
            userButton: {
              action__manageAccount: "Quản lý tài khoản",
              action__signOut: "Đăng xuất"
            },
            userProfile: {
              navbar: {
                title: "Cấu hình tài khoản",
                account: "Tài khoản",
                security: "Bảo mật & Thiết bị"
              },
              start: {
                profileSection: {
                  title: "Thông tin cá nhân"
                }
              }
            }
          }}
          appearance={{
            variables: {
              colorPrimary: "#059669",
              colorBackground: "#0f172a",
              borderRadius: "0.85rem"
            },
            elements: {
              cardBox:
                "shadow-2xl border border-slate-800/80 bg-slate-900/90 rounded-2xl overflow-hidden backdrop-blur-xl",
              headerTitle: "text-slate-100 font-extrabold text-xl tracking-tight",
              headerSubtitle: "text-slate-400 text-sm",
              formButtonPrimary:
                "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-lg shadow-emerald-950/50 rounded-xl transition-all h-11 text-base",
              formFieldInput:
                "bg-slate-950/80 border-slate-800 text-slate-100 placeholder:text-slate-500 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 h-11",
              footerActionLink: "text-emerald-400 hover:text-emerald-300 font-semibold",
              userButtonPopoverCard:
                "shadow-2xl border border-slate-800 bg-slate-900 text-slate-100 rounded-2xl p-2",
              userButtonPopoverActionButton: "hover:bg-slate-800 rounded-xl text-slate-200",
              userButtonPopoverActionButtonText: "font-medium text-sm text-slate-200"
            }
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}

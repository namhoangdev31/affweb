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
              colorPrimary: "#102c24",
              colorBackground: "#ffffff",
              borderRadius: "0.75rem"
            },
            elements: {
              cardBox: "shadow-xl border border-slate-200/80 rounded-2xl overflow-hidden",
              headerTitle: "text-slate-900 font-bold",
              headerSubtitle: "text-slate-500",
              navbar: "bg-slate-50 border-r border-slate-200/80",
              navbarButton:
                "text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium rounded-xl",
              navbarButtonActive:
                "bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900",
              userButtonPopoverCard: "shadow-2xl border border-slate-200 rounded-2xl p-2",
              userButtonPopoverActionButton: "hover:bg-slate-100 rounded-xl text-slate-700",
              userButtonPopoverActionButtonText: "font-medium text-sm text-slate-800",
              userButtonPopoverFooter: "hidden font-sans text-slate-400",
              footer: "hidden"
            }
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}

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
    "Tạo liên kết mua sắm Shopee, theo dõi đơn hàng và nhận lại một phần hoa hồng khi đơn được xác nhận.",
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
          signInFallbackRedirectUrl="/tenant"
          signUpFallbackRedirectUrl="/tenant"
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
              colorBackground: "#ffffff",
              borderRadius: "0.85rem"
            },
            elements: {
              cardBox:
                "shadow-xl border border-slate-200 bg-white rounded-2xl overflow-hidden backdrop-blur-xl",
              headerTitle: "text-slate-900 font-extrabold text-xl tracking-tight",
              headerSubtitle: "text-slate-500 text-sm",
              formButtonPrimary:
                "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 rounded-xl transition-all h-11 text-base",
              formFieldInput:
                "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 rounded-xl focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 h-11",
              footerActionLink: "text-emerald-600 hover:text-emerald-700 font-semibold",
              userButtonPopoverCard:
                "shadow-xl border border-slate-200 bg-white text-slate-900 rounded-2xl p-2 z-50",
              userPreviewMainIdentifier: "text-slate-900 font-bold text-sm",
              userPreviewSecondaryIdentifier: "text-slate-500 text-xs",
              userButtonPopoverActionButton:
                "hover:bg-slate-100 text-slate-800 rounded-xl px-3 py-2 transition-colors",
              userButtonPopoverActionButtonText: "font-semibold text-xs text-slate-800",
              userButtonPopoverActionButtonIcon: "text-emerald-600 size-4",
              userButtonPopoverFooter: "hidden",
              footer: "hidden",
              footerAction: "hidden",
              footerPages: "hidden",
              footerActionText: "hidden"
            }
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}

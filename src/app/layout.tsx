import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
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
    "Tạo liên kết mua sắm, theo dõi đơn và nhận lại một phần hoa hồng từ Shopee, ShopeeFood, Lazada và AccessTrade.",
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
          proxyUrl="/__clerk"
          ui={ui}
          appearance={{
            variables: {
              colorPrimary: "#102c24",
              colorBackground: "#fffdf7",
              borderRadius: "0.75rem"
            }
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}

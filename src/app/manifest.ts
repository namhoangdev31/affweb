import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hoàn Tiền — Affiliate Cashback",
    short_name: "Hoàn Tiền",
    description: "Tạo link, theo dõi đơn và quản lý cashback.",
    start_url: "/app",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f7f5ee",
    theme_color: "#102c24",
    lang: "vi",
    categories: ["finance", "shopping"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    screenshots: [
      {
        src: "/pwa-desktop.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide",
        label: "Trang chủ Hoàn Tiền trên máy tính"
      },
      {
        src: "/pwa-mobile.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Trang chủ Hoàn Tiền trên điện thoại"
      }
    ],
    shortcuts: [
      {
        name: "Tạo link",
        short_name: "Tạo link",
        url: "/app/links",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }]
      },
      {
        name: "Ví cashback",
        short_name: "Ví",
        url: "/app/wallet",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }]
      }
    ]
  };
}

import type { MetadataRoute } from "next";
import { loadServerEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/deals", "/partners", "/faq", "/terms", "/privacy", "/cashback-policy"],
      disallow: ["/app/", "/admin/", "/api/", "/auth/"]
    },
    sitemap: `${loadServerEnv().APP_BASE_URL.replace(/\/$/, "")}/sitemap.xml`
  };
}

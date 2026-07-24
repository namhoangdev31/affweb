import type { MetadataRoute } from "next";
import { loadServerEnv } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = loadServerEnv().APP_BASE_URL.replace(/\/$/, "");
  return ["", "/deals", "/partners", "/faq", "/terms", "/privacy", "/cashback-policy"].map(
    (path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      changeFrequency: path === "/deals" ? "daily" : "monthly",
      priority: path === "" ? 1 : 0.7
    })
  );
}

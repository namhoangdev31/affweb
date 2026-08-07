import { loadServerEnv } from "../src/lib/env";

const baseUrl = new URL(loadServerEnv().APP_BASE_URL);
const checks = [
  ["/", 200],
  ["/api/health/live", 200],
  ["/api/health/ready", 200],
  ["/manifest.webmanifest", 200],
  ["/sw.js", 200],
  ["/robots.txt", 200],
  ["/sitemap.xml", 200]
] as const;

console.log(`Starting production smoke check against ${baseUrl.origin}...`);

await Promise.all(
  checks.map(async ([path, expectedStatus]) => {
    const url = new URL(path, baseUrl);
    const response = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "affweb-production-smoke/1.0" }
    });
    if (response.status !== expectedStatus) {
      throw new Error(`${url} returned ${response.status}; expected ${expectedStatus}.`);
    }
    if (path === "/sw.js") {
      const body = await response.text();
      if (!body.includes("CACHE_VERSION") || !body.includes("/offline")) {
        throw new Error("Service worker response is incomplete.");
      }
    }
    console.log(`OK ${response.status} ${url}`);
  })
);

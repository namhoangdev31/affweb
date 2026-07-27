import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware(
  (_auth, request) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const host = request.headers.get("host") || "";
    const cleanHost = host.split(":")[0]?.toLowerCase() || "";
    const pathname = request.nextUrl.pathname;

    let tenantSlug = "";

    const RESERVED_SLUGS = new Set([
      "www", "admin", "app", "api", "t", "deals", "login", "sign-in", "sign-up",
      "privacy", "terms", "faq", "go", "shopee-lookup", "partners",
      "cashback-policy", "offline", "onboarding", "manifest.webmanifest",
      "robots.txt", "sitemap.xml", "sw.js"
    ]);

    // 1. Direct Path-based Multi-Tenancy (e.g. affweb.vn/sansale-koc or affweb.vn/t/sansale-koc)
    if (pathname.startsWith("/t/")) {
      const parts = pathname.split("/");
      if (parts.length >= 3 && parts[2]) {
        tenantSlug = parts[2].toLowerCase();
      }
    } else if (pathname.length > 1 && !pathname.includes(".")) {
      const firstSegment = pathname.split("/")[1]?.toLowerCase();
      if (firstSegment && !RESERVED_SLUGS.has(firstSegment)) {
        tenantSlug = firstSegment;
      }
    }

    // 2. Subdomain check fallback
    if (!tenantSlug) {
      const hostParts = cleanHost.split(".");
      if (cleanHost.endsWith(".localhost") && hostParts.length === 2) {
        tenantSlug = hostParts[0] || "";
      } else if (hostParts.length >= 3) {
        tenantSlug = hostParts[0] || "";
      }
    }

    // Filter out system reserved keywords
    if (RESERVED_SLUGS.has(tenantSlug)) {
      tenantSlug = "";
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-request-id", requestId);
    if (tenantSlug) {
      requestHeaders.set("x-tenant-slug", tenantSlug);
    }
    requestHeaders.set("x-host", cleanHost);

    const response = NextResponse.next({
      request: { headers: requestHeaders }
    });

    response.headers.set("x-request-id", requestId);
    if (tenantSlug) {
      response.headers.set("x-tenant-slug", tenantSlug);
      response.cookies.set("aff_tenant_slug", tenantSlug, {
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
        sameSite: "lax"
      });
    }
    response.headers.set("x-host", cleanHost);

    return response;
  },
  {
    contentSecurityPolicy: {
      strict: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": [
          "'self'",
          "blob:",
          "data:",
          "https://img.clerk.com",
          "https://*.clerk.com",
          "https://cf.shopee.vn",
          "https://down-vn.img.susercontent.com",
          "https://img.lazcdn.com",
          "https://addlivetag.com",
          "https://data.addlivetag.com",
          "https://api.qrserver.com"
        ],
        "connect-src": [
          "'self'",
          "https://*.clerk.accounts.dev",
          "https://*.clerk.com",
          "https://clerk-telemetry.com",
          "https://*.sentry.io",
          "https://*.ingest.sentry.io",
          "https://api-merchant.payos.vn",
          "https://bot-api.zaloplatforms.com"
        ],
        "worker-src": ["'self'", "blob:"],
        "manifest-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"]
      }
    }
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2)$).*)",
    "/(api)(.*)"
  ]
};

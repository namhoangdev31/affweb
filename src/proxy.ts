import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware(
  (_auth, request) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-request-id", requestId);

    const response = NextResponse.next({
      request: { headers: requestHeaders }
    });
    response.headers.set("x-request-id", requestId);
    return response;
  },
  {
    frontendApiProxy: {
      enabled: true,
      path: "/__clerk"
    },
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
          "https://data.addlivetag.com"
        ],
        "connect-src": [
          "'self'",
          "https://*.clerk.accounts.dev",
          "https://*.clerk.com",
          "https://clerk-telemetry.com",
          "https://*.sentry.io",
          "https://*.ingest.sentry.io"
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
    "/(api|__clerk)(.*)"
  ]
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const cleanHost = host.split(":")[0]?.toLowerCase() || "";
  const pathname = request.nextUrl.pathname;

  const response = NextResponse.next();

  let tenantSlug = "";

  // 1. Path-based Multi-Tenancy (e.g. affweb.vn/t/sansale-koc)
  if (pathname.startsWith("/t/")) {
    const parts = pathname.split("/");
    if (parts.length >= 3 && parts[2]) {
      tenantSlug = parts[2].toLowerCase();
    }
  }

  // 2. Fallback Subdomain check (if any custom subdomain exists)
  if (!tenantSlug) {
    const hostParts = cleanHost.split(".");
    if (cleanHost.endsWith(".localhost") && hostParts.length === 2) {
      tenantSlug = hostParts[0] || "";
    } else if (hostParts.length >= 3) {
      tenantSlug = hostParts[0] || "";
    }
  }

  // Filter out system reserved keywords
  if (["www", "admin", "app", "api", "t"].includes(tenantSlug)) {
    tenantSlug = "";
  }

  if (tenantSlug) {
    response.headers.set("x-tenant-slug", tenantSlug);
  }

  response.headers.set("x-host", cleanHost);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};

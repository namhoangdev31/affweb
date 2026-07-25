import { loadServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const version = JSON.stringify(loadServerEnv().NEXT_PUBLIC_BUILD_SHA);
  const source = `
const CACHE_VERSION = ${version};
const STATIC_CACHE = "static-" + CACHE_VERSION;
const PUBLIC_CACHE = "public-" + CACHE_VERSION;
const OFFLINE_URL = "/offline";
const PRECACHE = ["/offline", "/brand-mark.svg", "/icon-192.png", "/icon-512.png"];
const PRIVATE_PREFIXES = [
  "/api/",
  "/__clerk",
  "/auth/",
  "/sign-in",
  "/sign-up",
  "/login",
  "/app",
  "/admin",
  "/go/"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => ![STATIC_CACHE, PUBLIC_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isPrivate(url) {
  return PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivate(url)) return;

  if (url.pathname.startsWith("/_next/static/") || /\\.(?:woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  if (request.destination === "image" || url.pathname.startsWith("/deals")) {
    event.respondWith(
      caches.open(PUBLIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fresh = fetch(request).then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        });
        return cached || fresh;
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PUBLIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match(OFFLINE_URL))
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Hoàn Tiền", body: "Bạn có cập nhật mới.", deepLink: "/app/notifications" };
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed.deepLink === "string" && parsed.deepLink.startsWith("/") && !parsed.deepLink.startsWith("//")) {
      data = { title: String(parsed.title || data.title), body: String(parsed.body || data.body), deepLink: parsed.deepLink };
    }
  } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    data: { deepLink: data.deepLink }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = event.notification.data?.deepLink || "/app/notifications";
  event.waitUntil(clients.openWindow(new URL(deepLink, self.location.origin).toString()));
});
`;
  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/"
    }
  });
}

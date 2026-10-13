/*
 * UpayaInd service worker (D-110). Deliberately minimal:
 *  - pre-caches the app shell only: the branded /offline page, brand images, the manifest;
 *  - hashed Next.js static assets (/_next/static/*) are cached on first use (immutable);
 *  - navigations are network-first; when the network is unavailable, /offline is served;
 *  - NOTHING under /api/ and no HTML page with user data is ever cached.
 */
const VERSION = "upayaind-sw-v1";
const SHELL = ["/offline", "/manifest.webmanifest", "/brand/upayaind-logo.png", "/brand/upayaind-mark.png", "/brand/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never touch API routes, auth endpoints or downloads.
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets: cache-first (safe, immutable by construction).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Page navigations: always from the network (user data); offline page as fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(VERSION);
        return (await cache.match("/offline")) || new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
      }),
    );
    return;
  }

  // Pre-cached shell assets (brand images, manifest): cache-first with network fallback.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});

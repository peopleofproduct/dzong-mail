/* Unwalled Mail service worker - offline shell only.
   Mail content is never cached here; the app already reads from a local
   store, so the SW only keeps the UI shell reachable when the dev server
   or machine network blips. */
const VERSION = "unwalled-v1";
const SHELL = ["/offline.html", "/icon-192.png", "/icon-512.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
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

  // Static build assets: cache-first (they are content-hashed).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // API traffic: network only - stale mail data is worse than an error.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations + everything else: network-first, offline shell fallback.
  event.respondWith(
    fetch(req).catch(() =>
      req.mode === "navigate"
        ? caches.match("/offline.html").then((r) => r ?? Response.error())
        : Response.error(),
    ),
  );
});

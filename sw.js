/* Axis 1942 service worker — NETWORK-FIRST with cached offline fallback.
   Fully self-contained app (no external assets) so it plays offline.
   Bump VERSION together with static/js/version.js on every deploy. */
const VERSION = "axis-v40";
const SHELL = [
  "./",
  "index.html",
  "about.html",
  "manifest.webmanifest",
  "static/css/style.css",
  "static/js/version.js",
  "static/js/map-data.js",
  "static/js/engine.js",
  "static/js/combat.js",
  "static/js/ai.js",
  "static/js/online.js",
  "static/js/unit-icons.js",
  "static/js/board.js",
  "static/js/ui.js",
  "static/js/feedback.js",
  "static/js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // cache:"reload" bypasses the HTTP cache so the precache is truly current
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    // cache:"no-store" makes network-first REALLY network-first: a plain fetch()
    // can be answered by the browser's HTTP cache with a stale file, which we
    // would then re-save into our cache — locking an old version in. (Learned
    // the hard way on iOS.)
    fetch(req, { cache: "no-store" })
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === "navigate") return caches.match("index.html");
          return Response.error();
        })
      )
  );
});

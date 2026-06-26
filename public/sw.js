// Minimal service worker for installability.
// Network-first for navigations; no aggressive caching.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } }))
    );
  }
});

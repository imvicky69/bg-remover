const CACHE_NAME = "xweet-bg-v1";
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/favicon.png",
  "/icon.png",
  "/logo-clear.png",
  "/sample-before.jpg",
  "/sample-after.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isModelAsset =
    url.hostname.includes("huggingface.co") ||
    url.hostname.includes("hf.co") ||
    url.hostname.includes("jsdelivr.net") ||
    url.pathname.endsWith(".onnx") ||
    url.pathname.endsWith(".wasm");

  if (!isSameOrigin && !isModelAsset) return;

  // Cache-first for immutable model/wasm weights & static assets; network-first for HTML
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      });
    })
  );
});

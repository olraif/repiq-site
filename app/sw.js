const CACHE = "tutor-app-v44";
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.json", "./icon-32.png", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
const NETWORK_FIRST = [".html", ".js", ".css", ".json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((asset) => `${asset}?v=${CACHE}`))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const networkFirst = event.request.mode === "navigate" || NETWORK_FIRST.some((suffix) => url.pathname.endsWith(suffix));
  if (!networkFirst) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }
  event.respondWith(
    fetch(event.request, { cache: "reload" })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || caches.match(`./${url.pathname.split("/").pop()}?v=${CACHE}`))
  );
});

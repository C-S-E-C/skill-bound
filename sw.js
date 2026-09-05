const CACHE_NAME = "app_files";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const request = event.request;
    if (request.cache === "no-store") {
        event.respondWith(fetch(request));
        return;
    }
    event.respondWith(
        caches.match(request).then((cached) => cached || fetch(request).then((response) => {
            if (response.ok && new URL(request.url).origin === self.location.origin) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
        }))
    );
});

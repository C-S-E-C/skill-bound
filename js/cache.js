window.addEventListener("DOMContentLoaded", async function() {
    const cache = await caches.open("v1");
    const elements = document.querySelectorAll("img[src]"); // Target images specifically

    for (const el of elements) {
        const requestUrl = el.src;

        // Check if we already have it
        const cachedResponse = await cache.match(requestUrl);

        if (cachedResponse) {
            // Use the cached version
            const blob = await cachedResponse.blob();
            el.src = URL.createObjectURL(blob);
            console.log("Loaded from cache:", el.src);
        } else {
            // Not in cache? Fetch and add it for next time
            // Note: This may fail if CORS is not configured on the server
            cache.add(requestUrl).catch(err => console.warn("CORS/Cache error:", err));
            console.log("Added to cache:", requestUrl);
        }
    }
});
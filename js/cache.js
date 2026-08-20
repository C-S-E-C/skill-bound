// get cokkie use_cache
const use_cache = document.cookie.includes("use_cache=true");
if (!use_cache) {
    caches.delete("cache").then(() => {
        console.log("Cache cleared");
        // Set cookie to avoid clearing cache on every load
        document.cookie = "use_cache=true; max-age=604800; path=/"; // 7 days
    });
}

window.addEventListener("DOMContentLoaded", async function () {
    const cache = await caches.open("cache");
    const elements = document.querySelectorAll("*[src]"); // Select all elements with a src attribute
    for (const el of elements) {
        const requestUrl = el.src;

        // Check if we already have it
        const cachedResponse = await cache.match(requestUrl);

        if (cachedResponse) {
            // Use the cached version
            const blob = await cachedResponse.blob();
            el.src = URL.createObjectURL(blob);
            console.log("Loaded from cache: ", "blob:"+el.src);
        } else {
            // Not in cache? Fetch and add it for next time
            // Note: This may fail if CORS is not configured on the server
            cache
                .add(requestUrl)
                .catch((err) => console.warn("CORS/Cache error:", err));
            console.log("Added to cache:", requestUrl);
        }
    }
});

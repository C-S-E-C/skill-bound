/* ============================================
   Battle rendering
   Map, player sprites, and camera presentation.
   ============================================ */

async function loadMap(mapName) {
    const safeMapName = sanitizeMapName(mapName);
    try {
        const resp = await fetch(`maps/${safeMapName}`);
        if (!resp.ok) throw new Error("map not found");

        const raw = await resp.text();
        mapRows = raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (!mapRows.length) throw new Error("empty map");

        mapHeight = mapRows.length;
        mapWidth = Math.max(...mapRows.map((row) => row.length));

        const canvas = dom.mapCanvas;
        canvas.width = mapWidth * TILE_SIZE;
        canvas.height = mapHeight * TILE_SIZE;

        dom.worldLayer.style.width = canvas.width + "px";
        dom.worldLayer.style.height = canvas.height + "px";
        dom.playersLayer.style.width = canvas.width + "px";
        dom.playersLayer.style.height = canvas.height + "px";

        await preloadTileSprites();
        renderMap();
        log(`Map loaded: ${safeMapName}`);
    } catch {
        mapRows = new Array(100).fill("A".repeat(100));
        mapHeight = 100;
        mapWidth = 100;

        const canvas = dom.mapCanvas;
        canvas.width = mapWidth * TILE_SIZE;
        canvas.height = mapHeight * TILE_SIZE;

        await preloadTileSprites();
        renderMap();
        log(`Map fallback used: ${safeMapName}`);
    }
}

function renderMap() {
    const canvas = dom.mapCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < mapRows.length; y++) {
        const row = mapRows[y] || "";
        for (let x = 0; x < mapWidth; x++) {
            const cell = row[x] || DEFAULT_TILE;
            const defaultImg = tileSpriteCache.get(DEFAULT_TILE);
            const img = tileSpriteCache.get(cell) || defaultImg;
            if (!img) {
                ctx.fillStyle = "#1d2b3e";
                ctx.fillRect(
                    x * TILE_SIZE,
                    y * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE,
                );
                if (!hasLoggedMissingTileSprite) {
                    hasLoggedMissingTileSprite = true;
                    log("Map tile sprite missing; using color fallback.");
                }
                continue;
            }
            ctx.drawImage(
                img,
                x * TILE_SIZE,
                y * TILE_SIZE,
                TILE_SIZE,
                TILE_SIZE,
            );
        }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    for (let x = 0; x <= mapWidth; x += 2) {
        ctx.beginPath();
        ctx.moveTo(x * TILE_SIZE, 0);
        ctx.lineTo(x * TILE_SIZE, mapHeight * TILE_SIZE);
        ctx.stroke();
    }
    for (let y = 0; y <= mapHeight; y += 2) {
        ctx.beginPath();
        ctx.moveTo(0, y * TILE_SIZE);
        ctx.lineTo(mapWidth * TILE_SIZE, y * TILE_SIZE);
        ctx.stroke();
    }
}

function tileImage(cell) {
    if (cell in TILE_IMAGES) return TILE_IMAGES[cell];
    return "images/ground.webp";
}

async function preloadTileSprites() {
    const keys = new Set([DEFAULT_TILE, ...Object.keys(TILE_IMAGES)]);
    const tasks = Array.from(keys).map(async (key) => {
        const src = tileImage(key);
        try {
            const img = await loadImage(src);
            tileSpriteCache.set(key, img);
        } catch (err) {
            log(`${key}: ${err.message}`);
        }
    });
    await Promise.all(tasks);
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () =>
            reject(
                new Error(
                    `Failed to load image: ${src}. Check that the file exists and is accessible.`,
                ),
            );
        img.src = src;
    });
}

function renderPlayers() {
    dom.playersLayer.innerHTML = "";

    players.forEach((player) => {
        if (player.id === String(myId)) return;

        const el = document.createElement("div");
        el.className = "player" + (player.team === "B" ? " team-B" : "");
        el.style.left = player.x + "px";
        el.style.top = player.y + "px";

        const name = document.createElement("div");
        name.className = "player-name";
        name.textContent = player.name;
        el.appendChild(name);

        if (isTile(player.x, player.y, "G")) {
            el.style.display = "none";
        }

        dom.playersLayer.appendChild(el);
    });
}

function updateCamera() {
    const sceneRect = dom.scene.getBoundingClientRect();
    const tx = sceneRect.width / 2 - selfState.x;
    const ty = sceneRect.height / 2 - selfState.y;
    dom.worldLayer.style.transform = `translate(${tx}px, ${ty}px)`;
}

/* ============================================
   Battle Page Script (2D camera style)
   Layer 1: self (always screen center)
   Layer 2: map + other players
   ============================================ */

let TILE_SIZE = 32;
const DEFAULT_MAP = "air.map";
const DEFAULT_TILE = "A";
let MOVE_SPEED = 180; // world units/sec
let SEND_INTERVAL_MS = 32;
const DIAGONAL_SPEED_MULTIPLIER = 1 / Math.sqrt(2);
const WATER_SPEED_MULTIPLIER = 0.8;
const PLAYER_HITBOX_RADIUS = 14;
const BLOCK_TILE = "B";
const WATER_TILE = "W";
const TILE_IMAGES = {
    "A": "images/ground.webp",
    "G": "images/bushes.webp",
    "W": "images/water.webp",
    "B": "images/block.webp",
};
const tileSpriteCache = new Map();

let ws = null;
let myId = null;
let sessionId = null;
let battlefield = DEFAULT_MAP;

let mapRows = [];
let mapWidth = 100;
let mapHeight = 100;

const players = new Map();
let selfState = { id: null, name: "YOU", x: 1600, y: 1600, team: "A" };

const keys = new Set();
let lastFrameTime = 0;
let lastSendTime = 0;
let started = false;
let hasLoggedMissingTileSprite = false;

const dom = {
    sessionId: null,
    connectionState: null,
    worldLayer: null,
    mapCanvas: null,
    playersLayer: null,
    scene: null,
    startGame: null,
    eventLog: null,
    selfName: null,
};

window.addEventListener("DOMContentLoaded", init);

async function init() {
    cacheDom();

    myId = localStorage.getItem("userid") || sessionStorage.getItem("myId");

    const params = new URLSearchParams(window.location.search);
    sessionId = params.get("sessionId")
        || params.get("matchId")
        || sessionStorage.getItem("sessionId")
        || sessionStorage.getItem("matchId")
        || sessionStorage.getItem("groupId");

    battlefield = params.get("battlefield")
        || sessionStorage.getItem("battlefield")
        || DEFAULT_MAP;

    if (!myId || !sessionId) {
        setStatus("Missing user/session id. Back to pair...");
        setTimeout(() => { window.location.href = "pair.html"; }, 1200);
        return;
    }

    selfState.id = myId;
    selfState.name = myId;

    sessionStorage.setItem("sessionId", sessionId);
    sessionStorage.setItem("matchId", sessionId);

    dom.sessionId.textContent = sessionId;
    dom.selfName.textContent = myId;

    await loadMap(battlefield);
    connectWebSocket();
    bindEvents();

    requestAnimationFrame(gameLoop);
}

function cacheDom() {
    dom.sessionId = document.getElementById("session-id");
    dom.connectionState = document.getElementById("connection-state");
    dom.worldLayer = document.getElementById("world-layer");
    dom.mapCanvas = document.getElementById("map-canvas");
    dom.playersLayer = document.getElementById("players-layer");
    dom.scene = document.getElementById("scene");
    dom.startGame = document.getElementById("start-game");
    dom.eventLog = document.getElementById("event-log");
    dom.selfName = document.getElementById("self-name");
}

function bindEvents() {
    window.addEventListener("keydown", (e) => {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(e.key)) {
            e.preventDefault();
        }
        keys.add(e.key.toLowerCase());
    });

    window.addEventListener("keyup", (e) => {
        keys.delete(e.key.toLowerCase());
    });

    window.addEventListener("blur", () => {
        keys.clear();
    });

    window.addEventListener("resize", () => {
        renderMap();
    });

    dom.startGame.addEventListener("click", () => {
        wsSend({ action: "player_ready" });
        wsSend({ action: "start_game" });
        started = true;
        dom.startGame.disabled = true;
        log("Start requested.");
    });
}

function connectWebSocket() {
    const wsUrl = sessionStorage.getItem("WSServer") || "wss://1.s.syntropica.top:10012";
    if (!wsUrl) {
        setStatus("WSServer missing in sessionStorage");
        return;
    }

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        setStatus("Connected");
        wsSend({
            action: "join_match",
            matchId: sessionId,
            sessionId: sessionId,
            groupId: sessionStorage.getItem("groupId") || undefined,
        });
        log("Joined session " + sessionId);
    };

    ws.onmessage = (event) => {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }
        handleMessage(data);
    };

    ws.onerror = () => {
        setStatus("Connection error");
    };

    ws.onclose = () => {
        setStatus("Disconnected");
    };
}

function wsSend(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        userId: myId,
        matchId: sessionId,
        sessionId: sessionId,
        ...payload,
    }));
}

function handleMessage(msg) {
    if (msg.type === "paired" && (msg.matchId || msg.sessionId || msg.groupId)) {
        sessionId = msg.matchId || msg.sessionId || msg.groupId;
        dom.sessionId.textContent = sessionId;
        sessionStorage.setItem("sessionId", sessionId);
        sessionStorage.setItem("matchId", sessionId);
    }

    if (msg.type === "pairing_complete") {
        if (msg.matchId) {
            sessionId = msg.matchId;
            dom.sessionId.textContent = sessionId;
            sessionStorage.setItem("sessionId", sessionId);
            sessionStorage.setItem("matchId", sessionId);
        }
        if (msg.battlefield) {
            battlefield = msg.battlefield;
            sessionStorage.setItem("battlefield", battlefield);
            loadMap(battlefield);
        }
        started = true;
        dom.startGame.disabled = true;
        log("Pairing complete.");
        return;
    }

    if (msg.type === "match_joined") {
        if (msg.state) {
            applyGameState(msg.state);
        }
        if (msg.private?.name) {
            selfState.name = msg.private.name;
            dom.selfName.textContent = msg.private.name;
        }
        log("Match joined.");
        return;
    }

    if (msg.type === "game_start") {
        started = true;
        dom.startGame.disabled = true;
        if (msg.state) applyGameState(msg.state);
        log("Game started.");
        return;
    }

    if (msg.type === "game_state" && msg.state) {
        applyGameState(msg.state);
        return;
    }

    if (msg.type === "player_update" && msg.player) {
        updateSinglePlayer(msg.player);
        return;
    }

    if (msg.type === "error") {
        log("Error: " + (msg.message || "unknown"));
    }
}

function applyGameState(state) {
    if (state.battlefield && state.battlefield !== battlefield) {
        battlefield = state.battlefield;
        sessionStorage.setItem("battlefield", battlefield);
        loadMap(battlefield);
    }

    const rawPlayers = state.players || {};
    const next = new Map();

    Object.values(rawPlayers).forEach((p) => {
        const pos = readPlayerPos(p);
        const record = {
            id: String(p.id || p.userId || ""),
            name: String(p.name || p.playerName || p.id || "PLAYER"),
            team: p.team || "A",
            x: pos.x,
            y: pos.y,
            hp: p.hp,
            maxHp: p.max_hp,
            isDead: !!(p.is_dead || p.isDead),
        };

        if (!record.id) return;
        next.set(record.id, record);

        if (record.id === String(myId)) {
            selfState = { ...selfState, ...record };
            dom.selfName.textContent = record.name;
        }
    });

    players.clear();
    next.forEach((v, k) => players.set(k, v));

    renderPlayers();
}

function updateSinglePlayer(p) {
    const pos = readPlayerPos(p);
    const id = String(p.id || p.userId || "");
    if (!id) return;

    const prev = players.get(id) || {};
    const record = {
        ...prev,
        id,
        name: String(p.name || p.playerName || prev.name || id),
        team: p.team || prev.team || "A",
        x: pos.x,
        y: pos.y,
        hp: p.hp,
        maxHp: p.max_hp,
        isDead: !!(p.is_dead || p.isDead),
    };

    players.set(id, record);
    if (id === String(myId)) {
        selfState = { ...selfState, ...record };
        dom.selfName.textContent = record.name;
    }

    renderPlayers();
}

function readPlayerPos(player) {
    const px = Number(player.x ?? player.pos?.x ?? player.position?.x);
    const py = Number(player.y ?? player.pos?.y ?? player.position?.y);

    const fallbackSeed = hashCode(String(player.id || player.userId || "unknown"));
    const safeRangeX = Math.max(1, mapWidth * TILE_SIZE - 400);
    const safeRangeY = Math.max(1, mapHeight * TILE_SIZE - 400);
    const fallbackX = 200 + (fallbackSeed % safeRangeX);
    const fallbackY = 200 + ((fallbackSeed * 13) % safeRangeY);

    return {
        x: Number.isFinite(px) ? px : fallbackX,
        y: Number.isFinite(py) ? py : fallbackY,
    };
}

async function loadMap(mapName) {
    const safeMapName = sanitizeMapName(mapName);
    try {
        const resp = await fetch(`maps/${safeMapName}`);
        if (!resp.ok) throw new Error("map not found");

        const raw = await resp.text();
        mapRows = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

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
            // If DEFAULT_TILE is also missing, we intentionally fall back to a solid color tile.
            const img = tileSpriteCache.get(cell) || defaultImg;
            if (!img) {
                ctx.fillStyle = "#1d2b3e";
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                if (!hasLoggedMissingTileSprite) {
                    hasLoggedMissingTileSprite = true;
                    log("Map tile sprite missing; using color fallback.");
                }
                continue;
            }
            ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
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
    if (cell in TILE_IMAGES) {
        return TILE_IMAGES[cell];
    }
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
        img.onerror = () => reject(new Error(`Failed to load image: ${src}. Check that the file exists and is accessible.`));
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

        dom.playersLayer.appendChild(el);
    });
}

function gameLoop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const dt = Math.max(0, (timestamp - lastFrameTime) / 1000);
    lastFrameTime = timestamp;

    updateSelfMovement(dt, timestamp);
    updateCamera();

    requestAnimationFrame(gameLoop);
}

function updateSelfMovement(dt, now) {
    const dir = getInputDirection();
    if (dir.dx === 0 && dir.dy === 0) return;

    const speedMultiplier = isWaterTile(selfState.x, selfState.y) ? WATER_SPEED_MULTIPLIER : 1;
    const moveX = dir.dx * MOVE_SPEED * speedMultiplier * dt;
    const moveY = dir.dy * MOVE_SPEED * speedMultiplier * dt;

    const maxX = mapWidth * TILE_SIZE;
    const maxY = mapHeight * TILE_SIZE;

    const nextX = clamp(selfState.x + moveX, 0, maxX);
    if (!isBlockedByTile(nextX, selfState.y)) {
        selfState.x = nextX;
    }

    const nextY = clamp(selfState.y + moveY, 0, maxY);
    if (!isBlockedByTile(selfState.x, nextY)) {
        selfState.y = nextY;
    }

    if (now - lastSendTime >= SEND_INTERVAL_MS) {
        lastSendTime = now;
        wsSend({
            action: "move",
            direction: { x: dir.dx, y: dir.dy },
            x: Math.round(selfState.x),
            y: Math.round(selfState.y),
        });
    }
}

function getInputDirection() {
    let dx = 0;
    let dy = 0;

    if (keys.has("w") || keys.has("arrowup") || document.getElementById("up").classList.contains("active")) dy -= 1;
    if (keys.has("s") || keys.has("arrowdown") || document.getElementById("down").classList.contains("active")) dy += 1;
    if (keys.has("a") || keys.has("arrowleft") || document.getElementById("left").classList.contains("active")) dx -= 1;
    if (keys.has("d") || keys.has("arrowright") || document.getElementById("right").classList.contains("active")) dx += 1;

    if (dx !== 0 && dy !== 0) {
        dx *= DIAGONAL_SPEED_MULTIPLIER;
        dy *= DIAGONAL_SPEED_MULTIPLIER;
    }

    return { dx, dy };
}

function isWaterTile(worldX, worldY) {
    return getMapCellByWorld(worldX, worldY) === WATER_TILE;
}

function isBlockedByTile(worldX, worldY) {
    const minTileX = Math.floor((worldX - PLAYER_HITBOX_RADIUS) / TILE_SIZE);
    const maxTileX = Math.floor((worldX + PLAYER_HITBOX_RADIUS) / TILE_SIZE);
    const minTileY = Math.floor((worldY - PLAYER_HITBOX_RADIUS) / TILE_SIZE);
    const maxTileY = Math.floor((worldY + PLAYER_HITBOX_RADIUS) / TILE_SIZE);

    for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
        for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
            if (getMapCell(tileX, tileY) !== BLOCK_TILE) continue;
            if (circleIntersectsTile(worldX, worldY, PLAYER_HITBOX_RADIUS, tileX, tileY)) {
                return true;
            }
        }
    }
    return false;
}

function getMapCellByWorld(worldX, worldY) {
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    return getMapCell(tileX, tileY);
}

function getMapCell(tileX, tileY) {
    if (tileX < 0 || tileY < 0 || tileY >= mapRows.length || tileX >= mapWidth) {
        return DEFAULT_TILE;
    }
    const row = mapRows[tileY] || "";
    return row[tileX] || DEFAULT_TILE;
}

function circleIntersectsTile(cx, cy, radius, tileX, tileY) {
    const left = tileX * TILE_SIZE;
    const top = tileY * TILE_SIZE;
    const right = left + TILE_SIZE;
    const bottom = top + TILE_SIZE;

    const nearestX = clamp(cx, left, right);
    const nearestY = clamp(cy, top, bottom);
    const dx = cx - nearestX;
    const dy = cy - nearestY;

    return (dx * dx + dy * dy) <= (radius * radius);
}

function updateCamera() {
    const sceneRect = dom.scene.getBoundingClientRect();
    const tx = sceneRect.width / 2 - selfState.x;
    const ty = sceneRect.height / 2 - selfState.y;
    dom.worldLayer.style.transform = `translate(${tx}px, ${ty}px)`;
}

function setStatus(text) {
    dom.connectionState.textContent = text;
}

function log(text) {
    const line = document.createElement("div");
    line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    dom.eventLog.appendChild(line);
    dom.eventLog.scrollTop = dom.eventLog.scrollHeight;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function sanitizeMapName(mapName) {
    if (typeof mapName !== "string") return DEFAULT_MAP;
    const trimmed = mapName.trim();
    if (!/^[A-Za-z0-9._-]+\.map$/.test(trimmed)) return DEFAULT_MAP;
    return trimmed;
}

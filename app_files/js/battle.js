/* ============================================
   Battle Page Script (2D camera style)
   Layer 1: self (always screen center)
   Layer 2: map + other players
   ============================================ */

let TILE_SIZE = 32;
const DEFAULT_MAP = "air.map";
const DEFAULT_TILE = "A";
const BASIC_MOVE_SPEED = 200; // world units/sec
let Speed_multifier = 1;
let SEND_INTERVAL_MS = 32;
const DIAGONAL_SPEED_MULTIPLIER = 1 / Math.sqrt(2);
const WATER_SPEED_MULTIPLIER = 0.6;
const PLAYER_HITBOX_RADIUS = 14;
const PLAYER_HITBOX_RADIUS_SQUARED =
    PLAYER_HITBOX_RADIUS * PLAYER_HITBOX_RADIUS;
const BLOCK_TILE = "B";
const BATTLE_PROTOCOL = "skillbound.battle.v1";
const TILE_IMAGES = {
    A: "/images/ground.webp",
    G: "/images/bushes.webp",
    W: "/images/water.webp",
    B: "/images/block.webp",
};
const tileSpriteCache = new Map();

let rtcReady = false;
let rtcExpectedPeerIds = [];
let easyTierHandoffComplete = false;
const webrtcReadyPeers = new Set();
const playerCredits = new Map();
const validatedMoveMessages = new Set();
const movementVotes = new Map();
const movementResults = new Set();
const debugState = {
    enabled: false,
    routes: new Map(),
};
let battlePeerIds = [];
let battlePlayers = [];
let myId = null;
let sessionId = null;
let battlefield = DEFAULT_MAP;
let SelfUpdaateMessageCount = 0;
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
    debugCanvas: null,
    debugStatus: null,
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
    sessionId =
        params.get("sessionId") ||
        params.get("matchId") ||
        sessionStorage.getItem("sessionId") ||
        sessionStorage.getItem("matchId") ||
        sessionStorage.getItem("groupId");

    battlefield =
        params.get("battlefield") ||
        sessionStorage.getItem("battlefield") ||
        DEFAULT_MAP;

    if (!myId || !sessionId) {
        setStatus("Missing user/session id. Back to pair...");
        setTimeout(() => {
            window.location.href = "pair.html";
        }, 1200);
        return;
    }

    selfState.id = myId;
    selfState.name = myId;

    sessionStorage.setItem("sessionId", sessionId);
    sessionStorage.setItem("matchId", sessionId);

    dom.sessionId.textContent = sessionId;
    dom.selfName.textContent = myId;
    players.set(myId, selfState);

    await loadMap(battlefield);
    dom.startGame.disabled = true;
    await connectBattleWebRTC();
    bindEvents();

    requestAnimationFrame(gameLoop);
}

function cacheDom() {
    dom.sessionId = document.getElementById("session-id");
    dom.connectionState = document.getElementById("connection-state");
    dom.worldLayer = document.getElementById("world-layer");
    dom.mapCanvas = document.getElementById("map-canvas");
    dom.playersLayer = document.getElementById("players-layer");
    dom.debugCanvas = document.getElementById("debug-canvas");
    dom.debugStatus = document.getElementById("debug-status");
    dom.scene = document.getElementById("scene");
    dom.startGame = document.getElementById("start-game");
    dom.eventLog = document.getElementById("event-log");
    dom.selfName = document.getElementById("self-name");
}

function bindEvents() {
    window.addEventListener("keydown", (e) => {
        if (e.key === "F3") {
            e.preventDefault();
            debugState.enabled = !debugState.enabled;
            document.getElementById("battle-root").classList.toggle("debug-mode", debugState.enabled);
            updateDebugOverlay();
            renderDebugRoutes();
            log(debugState.enabled ? "Debug mode enabled." : "Debug mode disabled.");
            return;
        }
        if (
            [
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "w",
                "a",
                "s",
                "d",
                "W",
                "A",
                "S",
                "D",
            ].includes(e.key)
        ) {
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
        battleSend({ type: "game_start", state: buildGameState() });
        started = true;
        dom.startGame.disabled = true;
        log("Start requested.");
    });
}

async function connectBattleWebRTC() {
    readBattleSession();

    while (typeof easytier === "undefined" || typeof easytierWebRTC === "undefined") {
        await wait(50);
    }

    const localPeerId = Number(easytier.status().localPeerId);

    if (!easytier.status().connected) {
        await easytier.connect(
            location.protocol === "https:" ? "wss" : "ws",
            localStorage.getItem("etserver") || "cn-sh-0.s.syntropica.top",
            location.protocol === "https:" ? 11012 : 11011,
            "skillbound",
            "",
        ).catch((error) => {
            if (!/already connected/i.test(error.message)) throw error;
        });
    }

    easytierWebRTC.on("open", (peer) => {
        rtcReady = true;
        setStatus("WebRTC connected");
        log("WebRTC open: " + peer.peerId);
        battleSend({ type: "webrtc_ready", peerId: localPeerId }, peer.peerId);
        battleSend({ type: "match_joined", state: buildGameState() }, peer.peerId);
        finishEasyTierHandoff();
    });
    easytierWebRTC.on("message", (event) => {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }
        if (data.protocol !== BATTLE_PROTOCOL || data.sessionId !== sessionId) return;
        handleMessage(data.payload, data);
        relayBattleEnvelope(data, event.peerId);
    });
    easytierWebRTC.on("close", (peer) => {
        rtcReady = false;
        log("WebRTC closed: " + peer.peerId + ". Reconnecting...");
        schedulePeerReconnect(Number(peer.peerId));
    });
    easytierWebRTC.on("error", (error) => {
        setStatus("WebRTC error");
        log("WebRTC error: " + error.message);
    });

    const allPeerIds = uniquePeerIds([...battlePeerIds, localPeerId]);
    rtcExpectedPeerIds = allPeerIds.filter((peerId) => peerId !== localPeerId);
    const outgoingPeerIds = rtcExpectedPeerIds.filter((peerId) => localPeerId < peerId);
    if (!rtcExpectedPeerIds.length) {
        rtcReady = true;
        dom.startGame.disabled = false;
        setStatus("Solo battle");
        applyInitialPlayers();
        return;
    }

    for (const peerId of outgoingPeerIds) {
        await easytierWebRTC.connect(peerId, {
            autoDisconnectEasyTier: false,
            sessionId: `${sessionId}:${Math.min(localPeerId, peerId)}:${Math.max(localPeerId, peerId)}`,
        });
    }
    const openPeerIds = easytierWebRTC.status().openPeerIds.map(Number);
    openPeerIds.forEach((peerId) => {
        battleSend({ type: "webrtc_ready", peerId: localPeerId }, peerId);
        battleSend({ type: "match_joined", state: buildGameState() }, peerId);
    });
    setStatus(`WebRTC mesh ${outgoingPeerIds.length} outgoing / ${rtcExpectedPeerIds.length} peers`);
    finishEasyTierHandoff();
    applyInitialPlayers();
}

function uniquePeerIds(values) {
    return Array.from(new Set(values.map(Number))).filter(
        (peerId) => Number.isInteger(peerId) && peerId > 0,
    );
}

function finishEasyTierHandoff() {
    if (easyTierHandoffComplete || !rtcExpectedPeerIds.length) return;
    const openPeerIds = easytierWebRTC.status().openPeerIds.map(Number);
    const allChannelsOpen = rtcExpectedPeerIds.every((peerId) =>
        openPeerIds.includes(Number(peerId)),
    );
    const allPeersConfirmed = rtcExpectedPeerIds.every((peerId) =>
        webrtcReadyPeers.has(Number(peerId)),
    );
    if (!allChannelsOpen || !allPeersConfirmed) {
        setStatus(
            `WebRTC ${openPeerIds.length}/${rtcExpectedPeerIds.length} open, ` +
            `${webrtcReadyPeers.size}/${rtcExpectedPeerIds.length} confirmed`,
        );
        return;
    }

    easyTierHandoffComplete = true;
    rtcReady = true;
    dom.startGame.disabled = false;
    setStatus("WebRTC mesh ready");
    log("WebRTC mesh ready; keeping EasyTier available for reconnects.");
}

const reconnectTimers = new Map();

function schedulePeerReconnect(peerId) {
    if (!peerId || reconnectTimers.has(peerId)) return;
    reconnectTimers.set(peerId, setTimeout(async () => {
        reconnectTimers.delete(peerId);
        if (!rtcExpectedPeerIds.includes(peerId)) return;
        try {
            await ensureEasyTierConnected();
            await easytierWebRTC.connect(peerId, {
                autoDisconnectEasyTier: false,
                sessionId,
            });
            log("WebRTC reconnect requested: " + peerId);
        } catch (error) {
            log("WebRTC reconnect failed: " + error.message);
            schedulePeerReconnect(peerId);
        }
    }, 1000));
}

async function ensureEasyTierConnected() {
    if (easytier.status().connected) return;
    await easytier.connect(
        location.protocol === "https:" ? "wss" : "ws",
        localStorage.getItem("etserver") || "cn-sh-0.s.syntropica.top",
        location.protocol === "https:" ? 11012 : 11011,
        "skillbound",
        "",
    ).catch((error) => {
        if (!/already connected/i.test(error.message)) throw error;
    });
}

function readBattleSession() {
    try {
        battlePeerIds = JSON.parse(sessionStorage.getItem("battlePeers") || "[]")
            .map(Number)
            .filter(Boolean);
    } catch {
        battlePeerIds = [];
    }
    try {
        battlePlayers = JSON.parse(sessionStorage.getItem("battlePlayers") || "[]");
    } catch {
        battlePlayers = [];
    }
}

function applyInitialPlayers() {
    if (!battlePlayers.length) return;
    const statePlayers = {};
    battlePlayers.forEach((player) => {
        statePlayers[player.id || player.name] = {
            id: player.id || player.name,
            name: player.name || player.id,
            team: player.team || "A",
        };
    });
    applyGameState({ battlefield, players: statePlayers });
}

function battleSend(payload, peerId) {
    const envelope = {
        protocol: BATTLE_PROTOCOL,
        sessionId,
        senderId: myId,
        messageId:
            myId +
            "-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2),
        payload: {
            userId: myId,
            matchId: sessionId,
            sessionId,
            ...payload,
        },
    };
    seenBattleMessages.add(envelope.messageId);
    sendBattleEnvelope(envelope, peerId);
}

const seenBattleMessages = new Set();

function sendBattleEnvelope(envelope, peerId) {
    const encoded = JSON.stringify(envelope);
    try {
        if (peerId) {
            easytierWebRTC.send(encoded, peerId);
        } else {
            easytierWebRTC.broadcast(encoded);
        }
    } catch (_) {
        // The local state still advances before every send; broadcasts are best-effort while channels open.
    }
}

function relayBattleEnvelope(envelope, fromPeerId) {
    if (!envelope.messageId || seenBattleMessages.has(envelope.messageId)) return;
    seenBattleMessages.add(envelope.messageId);
    easytierWebRTC.status().openPeerIds.forEach((peerId) => {
        if (peerId !== fromPeerId) sendBattleEnvelope(envelope, peerId);
    });
}

function buildGameState() {
    const statePlayers = {};
    players.forEach((player, id) => {
        statePlayers[id] = player;
    });
    statePlayers[selfState.id] = selfState;
    return {
        battlefield,
        players: statePlayers,
    };
}

function handleMessage(msg, envelope = null) {
    if (
        msg.type === "paired" &&
        (msg.matchId || msg.sessionId || msg.groupId)
    ) {
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

    if (msg.type === "webrtc_ready") {
        const peerId = Number(msg.peerId);
        if (peerId) {
            webrtcReadyPeers.add(peerId);
            log("WebRTC confirmed by " + peerId + ".");
            finishEasyTierHandoff();
        }
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
        updateSinglePlayer(msg.player, envelope);
        return;
    }

    if (msg.type === "move_vote" && msg.moveId) {
        receiveMovementVote(msg);
        return;
    }

    if (msg.type === "move_result" && msg.moveId) {
        applyMovementResult(msg);
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
            // The server can echo slightly stale self positions; throttle correction so local movement stays responsive.
            if (SelfUpdaateMessageCount % 10 === 0) {
                selfState = { ...selfState, ...record };
            }
            SelfUpdaateMessageCount++;
            dom.selfName.textContent = record.name;
        }
    });

    players.clear();
    next.forEach((v, k) => players.set(k, v));

    renderPlayers();
}

function validateRemoteMovement(id, previous, next, messageId) {
    if (!messageId || validatedMoveMessages.has(messageId)) return;
    validatedMoveMessages.add(messageId);
    const route = buildMovementRoutes(previous, next);
    debugState.routes.set(id, route);
    const directDistance = distance(previous, next);
    const shortestDistance = route.shortest.length > 1
        ? routeLength(route.shortest)
        : directDistance;
    const allowedDistance = BASIC_MOVE_SPEED * Speed_multifier * (SEND_INTERVAL_MS / 1000) * 1.5;
    const valid = directDistance <= allowedDistance &&
        (shortestDistance <= allowedDistance + TILE_SIZE * 1.5 || directDistance <= TILE_SIZE);
    updateDebugOverlay();
    renderDebugRoutes();
    if (valid) return;

    const vote = {
        type: "move_vote",
        moveId: messageId,
        playerId: id,
        voterId: myId,
        valid: false,
    };
    recordMovementVote(vote);
    battleSend(vote);
}

function recordMovementVote(vote) {
    if (!vote?.moveId || movementResults.has(vote.moveId)) return;
    let record = movementVotes.get(vote.moveId);
    if (!record) {
        record = { playerId: vote.playerId, votes: new Map(), announced: false };
        movementVotes.set(vote.moveId, record);
    }
    if (!record.votes.has(vote.voterId)) record.votes.set(vote.voterId, !!vote.valid);
    finalizeMovementVote(vote.moveId, record);
}

function receiveMovementVote(vote) {
    if (!vote.voterId || vote.voterId === myId || vote.valid !== false) return;
    recordMovementVote(vote);
}

function finalizeMovementVote(moveId, record) {
    if (record.announced || record.votes.size < movementVoteThreshold()) return;
    const invalidVotes = Array.from(record.votes.values()).filter((valid) => !valid).length;
    if (invalidVotes < movementVoteThreshold()) return;
    record.announced = true;
    const result = {
        type: "move_result",
        moveId,
        playerId: record.playerId,
        valid: false,
        decidedBy: myId,
    };
    applyMovementResult(result);
    battleSend(result);
}

function movementVoteThreshold() {
    const totalPeers = uniquePeerIds([
        ...battlePeerIds,
        Number(easytier.status().localPeerId),
    ]).length;
    return Math.max(1, Math.floor(totalPeers / 2) + 1);
}

function applyMovementResult(result) {
    if (movementResults.has(result.moveId)) return;
    movementResults.add(result.moveId);
    if (!result.valid) applyCredit(result.playerId, -1);
    updateDebugOverlay();
}

function applyCredit(id, delta) {
    const current = playerCredits.get(id) ?? 100;
    playerCredits.set(id, clamp(current + delta, 0, 100));
}

function updateSinglePlayer(p, envelope = null) {
    const pos = readPlayerPos(p);
    const id = String(p.id || p.userId || "");
    if (!id) return;

    const prev = players.get(id) || {};
    if (envelope && prev.x != null && prev.y != null) {
        validateRemoteMovement(id, prev, pos, envelope.messageId);
    }
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

    // Keep players visible even when older/newer server payloads omit position fields.
    const fallbackSeed = hashCode(
        String(player.id || player.userId || "unknown"),
    );
    const safeRangeX = Math.max(1, mapWidth * TILE_SIZE - 400);
    const safeRangeY = Math.max(1, mapHeight * TILE_SIZE - 400);
    const fallbackX = 200 + (fallbackSeed % safeRangeX);
    const fallbackY = 200 + ((fallbackSeed * 13) % safeRangeY);

    return {
        x: Number.isFinite(px) ? px : fallbackX,
        y: Number.isFinite(py) ? py : fallbackY,
    };
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
    const moveX = dir.dx * BASIC_MOVE_SPEED * Speed_multifier * dt;
    const moveY = dir.dy * BASIC_MOVE_SPEED * Speed_multifier * dt;
    const projectedX = selfState.x + moveX;
    const projectedY = selfState.y + moveY;
    // Speed_multifier = Is_wall ? (-1 * Speed_multifier) : Speed_multifier;
    const maxX = mapWidth * TILE_SIZE;
    const maxY = mapHeight * TILE_SIZE;

    const prevX = selfState.x;
    const prevY = selfState.y;
    const nextX = clamp(prevX + moveX, 0, maxX);
    const nextY = clamp(prevY + moveY, 0, maxY);

    const canMoveDiagonal = !isBlockedByTile(nextX, nextY);

    if (canMoveDiagonal) {
        selfState.x = nextX;
        selfState.y = nextY;
    } else {
        const canMoveX = !isBlockedByTile(nextX, prevY);
        const canMoveY = !isBlockedByTile(prevX, nextY);
        if (canMoveX) selfState.x = nextX;
        if (canMoveY) selfState.y = nextY;
    }

    if (now - lastSendTime >= SEND_INTERVAL_MS) {
        lastSendTime = now;
        const update = {
            type: "player_update",
            action: "move",
            player: {
                ...selfState,
                x: Math.round(selfState.x),
                y: Math.round(selfState.y),
            },
            direction: { x: dir.dx, y: dir.dy },
            x: Math.round(selfState.x),
            y: Math.round(selfState.y),
        };
        battleSend(update);
        updateDebugOverlay();
        renderDebugRoutes();
    }
}

function getInputDirection() {
    let dx = 0;
    let dy = 0;

    if (keys.has("w") || keys.has("arrowup")) dy -= 1;
    if (keys.has("s") || keys.has("arrowdown")) dy += 1;
    if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
    if (keys.has("d") || keys.has("arrowright")) dx += 1;

    if (dx !== 0 && dy !== 0) {
        dx *= DIAGONAL_SPEED_MULTIPLIER;
        dy *= DIAGONAL_SPEED_MULTIPLIER;
    }

    return { dx, dy };
}

function buildMovementRoutes(previous, next) {
    const direct = [{ x: previous.x, y: previous.y }, { x: next.x, y: next.y }];
    const shortest = findShortestRoute(previous, next);
    const smooth = smoothRoute(shortest);
    return { direct, shortest, smooth };
}

function findShortestRoute(start, end) {
    const startTile = worldToTile(start);
    const endTile = worldToTile(end);
    const queue = [startTile];
    const cameFrom = new Map([[tileKey(startTile), null]]);
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (queue.length) {
        const current = queue.shift();
        if (current.x === endTile.x && current.y === endTile.y) break;
        directions.forEach(([dx, dy]) => {
            const candidate = { x: current.x + dx, y: current.y + dy };
            const key = tileKey(candidate);
            if (
                candidate.x < 0 ||
                candidate.y < 0 ||
                candidate.x >= mapWidth ||
                candidate.y >= mapHeight ||
                cameFrom.has(key) ||
                isBlockedByTile(
                    candidate.x * TILE_SIZE + TILE_SIZE / 2,
                    candidate.y * TILE_SIZE + TILE_SIZE / 2,
                )
            ) return;
            cameFrom.set(key, current);
            queue.push(candidate);
        });
    }
    const path = [];
    let cursor = endTile;
    while (cursor && cameFrom.has(tileKey(cursor))) {
        path.unshift({ x: cursor.x * TILE_SIZE + TILE_SIZE / 2, y: cursor.y * TILE_SIZE + TILE_SIZE / 2 });
        cursor = cameFrom.get(tileKey(cursor));
    }
    return path.length ? path : [{ x: start.x, y: start.y }, { x: end.x, y: end.y }];
}

function smoothRoute(route) {
    return route.map((point, index) => {
        if (index === 0 || index === route.length - 1) return point;
        const previous = route[index - 1];
        const next = route[index + 1];
        return { x: point.x * 0.65 + (previous.x + next.x) * 0.175, y: point.y * 0.65 + (previous.y + next.y) * 0.175 };
    });
}

function worldToTile(point) {
    return { x: Math.floor(point.x / TILE_SIZE), y: Math.floor(point.y / TILE_SIZE) };
}

function tileKey(tile) { return `${tile.x},${tile.y}`; }
function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
function routeLength(route) { return route.slice(1).reduce((sum, point, index) => sum + distance(route[index], point), 0); }

function renderDebugRoutes() {
    if (!dom.debugCanvas) return;
    const canvas = dom.debugCanvas;
    canvas.width = mapWidth * TILE_SIZE;
    canvas.height = mapHeight * TILE_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!debugState.enabled) return;
    debugState.routes.forEach((route) => {
        drawRoute(ctx, route.direct, "#fff");
        drawRoute(ctx, route.shortest, "#39e06f");
        drawRoute(ctx, route.smooth, "#33aaff");
    });
}

function drawRoute(ctx, route, color) {
    if (route.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(route[0].x, route[0].y);
    route.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
}

function updateDebugOverlay() {
    if (!dom.debugStatus) return;
    const entries = Array.from(playerCredits.entries()).map(([id, credit]) => `${id}: credit ${credit}`);
    dom.debugStatus.textContent = debugState.enabled ? `F3 DEBUG\nself: (${Math.round(selfState.x)}, ${Math.round(selfState.y)})\n${entries.join("\n")}` : "";
}

function isTile(worldX, worldY, tileType) {
    return getMapCellByWorld(worldX, worldY) === tileType;
}

function isBlockedByTile(worldX, worldY) {
    const minTileX = Math.floor((worldX - PLAYER_HITBOX_RADIUS) / TILE_SIZE);
    const maxTileX = Math.floor((worldX + PLAYER_HITBOX_RADIUS) / TILE_SIZE);
    const minTileY = Math.floor((worldY - PLAYER_HITBOX_RADIUS) / TILE_SIZE);
    const maxTileY = Math.floor((worldY + PLAYER_HITBOX_RADIUS) / TILE_SIZE);

    // Check every tile touched by the circular hitbox, not only the tile under the player's center.
    for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
        for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
            if (
                getMapCell(tileX, tileY) !== "W" &&
                getMapCell(tileX, tileY) !== "B"
            )
                continue;
            if (circleIntersectsTile(worldX, worldY, tileX, tileY)) {
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
    if (tileX < 0 || tileX >= mapWidth || tileY < 0 || tileY >= mapHeight) {
        return DEFAULT_TILE;
    }
    const row = mapRows[tileY] || "";
    return row[tileX] || DEFAULT_TILE;
}

function circleIntersectsTile(cx, cy, tileX, tileY) {
    const left = tileX * TILE_SIZE;
    const top = tileY * TILE_SIZE;
    const right = left + TILE_SIZE;
    const bottom = top + TILE_SIZE;

    const nearestX = clamp(cx, left, right);
    const nearestY = clamp(cy, top, bottom);
    const dx = cx - nearestX;
    const dy = cy - nearestY;

    return dx * dx + dy * dy <= PLAYER_HITBOX_RADIUS_SQUARED;
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
        hash = (hash << 5) - hash + str.charCodeAt(i);
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

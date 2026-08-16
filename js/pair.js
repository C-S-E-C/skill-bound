/* ============================================
   Pair/Battle Page Script
   ============================================ */

using("/js/easytier.js");
using("/js/crypto.js");

const music = document.getElementById("background-music");
music.currentTime = sessionStorage.getItem("bgmtime") || 0;
music.play().catch(() => {});

const PAIR_PROTOCOL = "skillbound.pairing.v2";
const PUBLIC_VERIFY_CODE = 0;
const PEER_SYNC_INTERVAL_MS = 2500;
const PUBLIC_SCAN_RADIUS = 256;
const PACKET_TYPES = {
    RequestPair: 0,
    RefusePair: 1,
    AcceptPair: 2,
    RedirectPair: 3,
    UpdatePair: 4,
    StartBattle: 5,
    SyncPair: 6,
    TeamChange: 7,
};

fetch("maps/index.json")
    .then((response) => response.json())
    .then((maps) => {
        const mapSelect = document.getElementById("map-choice");
        maps.forEach((map) => {
            const option = document.createElement("option");
            option.value = map;
            option.textContent = map.toUpperCase().replace(".MAP", "");
            mapSelect.appendChild(option);
        });
    })
    .catch((error) => console.error("Failed to load maps:", error));

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueNumbers(values) {
    return Array.from(new Set(values.map(Number))).filter(
        (value) =>
            Number.isInteger(value) &&
            value > 0 &&
            value <= 0xffffffff,
    );
}

function parsePairPayload(packet) {
    if (
        packet.encrypted ||
        (packet.type !== easytier.PacketType.RPC_REQUEST &&
            packet.type !== easytier.PacketType.RPC_RESPONSE)
    ) {
        return null;
    }

    try {
        const message = JSON.parse(new TextDecoder().decode(packet.payload));
        if (message && message.protocol === PAIR_PROTOCOL) return message;
    } catch (_) {
        return null;
    }
    return null;
}

function makeRoomId() {
    if (typeof generateRandomBase32Secret === "function") {
        return generateRandomBase32Secret(12).replace(/=+$/g, "");
    }
    return Math.random().toString(36).slice(2, 14).toUpperCase();
}

function normalizePlayer(player) {
    return {
        name: String(player?.name || "Player").slice(0, 24),
        id: String(player?.id || player?.name || "Player").slice(0, 64),
        ETid: Number(player?.ETid || 0),
        team: player?.team === "B" ? "B" : "A",
    };
}

function mergePlayers(left, right) {
    const merged = new Map();
    [...left, ...right].forEach((player) => {
        const normalized = normalizePlayer(player);
        if (normalized.ETid) merged.set(normalized.ETid, normalized);
    });
    return Array.from(merged.values());
}

function assignRandomTeams(players, teamSize) {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const assignments = new Map();
    shuffled.forEach((player, index) => {
        assignments.set(player.ETid, index < teamSize ? "A" : "B");
    });
    return players.map((player) => ({
        ...player,
        team: assignments.get(player.ETid) || "A",
    }));
}

function fillTeams(players, teamSize) {
    let teamACount = 0;
    let teamBCount = 0;
    return players.map((player) => {
        const preferredTeam = player.team === "B" ? "B" : "A";
        const next = { ...player };
        if (preferredTeam === "A" && teamACount < teamSize) {
            teamACount++;
            next.team = "A";
            return next;
        }
        if (preferredTeam === "B" && teamBCount < teamSize) {
            teamBCount++;
            next.team = "B";
            return next;
        }
        if (teamACount <= teamBCount && teamACount < teamSize) {
            teamACount++;
            next.team = "A";
        } else {
            teamBCount++;
            next.team = "B";
        }
        return next;
    });
}

class PairingHandlerClass {
    constructor() {
        this.Stats = {
            ETloading: 0,
            PrivateRoom: 1,
            OpenToPublic: 2,
            InRoom: 3,
        };
        this.CurStat = this.Stats.ETloading;
        this.RoomID = "";
        this.etconnected = false;
        this.players = [];
        this.peerList = [];
        this.startVotes = [];
        this.mode = 1;
        this.teamMode = "random";
        this.battlefield = "air.map";
        this.leaderPeerId = null;
        this.isPrivate = false;
        this.pairingActive = false;
        this.verifyCode = PUBLIC_VERIFY_CODE;
        this.packetUnsubscribe = null;
        this.peerSyncTimer = null;
        this.publicScanBusy = false;
    }

    async connectET() {
        while (typeof easytier === "undefined") await sleep(50);
        if (this.etconnected && easytier.status().connected) return;

        await easytier.connect(
            location.protocol === "https:" ? "wss" : "ws",
            localStorage.getItem("etserver") || "cn-sh-0.s.syntropica.top",
            location.protocol === "https:" ? 11012 : 11011,
            "skillbound",
            "",
        );

        while (!easytier.status().connected) await sleep(100);
        this.etconnected = true;

        if (!this.packetUnsubscribe) {
            this.packetUnsubscribe = easytier.on("packet", (packet) =>
                this.handlePacket(packet),
            );
            easytier.on("peer-observed", () => this.syncObservedPeers());
        }
    }

    async getPairEls() {
        return {
            screen1: {
                self: document.getElementById("screen1"),
                mode: parseInt(document.getElementById("mode-choice").value, 10),
                teamMode: document.getElementById("team-mode-choice").value,
                battlefield: document.getElementById("map-choice").value,
            },
            screen2: {
                self: document.getElementById("screen2"),
                PlayerList: document.getElementById("connected-players"),
                statusText: document.getElementById("status-text-screen2"),
            },
            screen3: {
                self: document.getElementById("screen3"),
                ourTeam: document.getElementById("our-team"),
                opponentTeam: document.getElementById("opponent-team"),
                statusText: document.getElementById("status-text-screen3"),
                startBattle: document.getElementById("start-battle"),
                createRoom: document.getElementById("create-room"),
            },
        };
    }

    localPeerId() {
        return easytier.status().localPeerId;
    }

    selfPlayer() {
        const userId = localStorage.getItem("userid") || "Player";
        return normalizePlayer({
            name: userId,
            id: userId,
            ETid: this.localPeerId(),
        });
    }

    teamSize() {
        return Math.max(1, Math.min(4, Number(this.mode) || 1));
    }

    maxPlayers() {
        return this.teamSize() * 2;
    }

    requiredStartVotes() {
        return Math.ceil((Math.max(this.players.length, this.peerList.length) * 2) / 3);
    }

    isLeader() {
        return this.peerList[0] === this.localPeerId();
    }

    resetLeaderList() {
        this.peerList = [this.localPeerId()];
        this.leaderPeerId = this.localPeerId();
    }

    sendPairMessage(peerId, type, data, response = false) {
        if (!peerId || peerId === this.localPeerId()) return;
        easytier.send(
            response
                ? easytier.PacketType.RPC_RESPONSE
                : easytier.PacketType.RPC_REQUEST,
            JSON.stringify({
                protocol: PAIR_PROTOCOL,
                type,
                roomId: this.RoomID,
                data,
            }),
            peerId,
        );
    }

    async startPairing(isPrivate) {
        const pairEls = await this.getPairEls();
        await this.connectET();

        this.mode = pairEls.screen1.mode;
        this.teamMode = pairEls.screen1.teamMode;
        this.battlefield = pairEls.screen1.battlefield;
        this.RoomID = makeRoomId();
        this.isPrivate = isPrivate;
        this.pairingActive = true;
        this.verifyCode = PUBLIC_VERIFY_CODE;
        this.CurStat = isPrivate ? this.Stats.PrivateRoom : this.Stats.OpenToPublic;
        this.resetLeaderList();
        this.players = [this.selfPlayer()];
        this.startVotes = [];
        this.startPeerSync();

        pairEls.screen1.self.style.display = "none";
        pairEls.screen2.self.style.display = "flex";
        await this.renderPlayers();
    }

    async publicPair() {
        await this.startPairing(false);
        this.setStatus("Public pairing active. Scanning observed EasyTier peers...");
        this.syncObservedPeers();
    }

    async privatePair() {
        await this.startPairing(true);
        this.verifyCode = Math.floor(Math.random() * 255) + 1;
        const code = `0x${this.localPeerId().toString(16).padStart(8, "0")}${this.verifyCode.toString(16).padStart(2, "0")}`.toUpperCase();
        this.setStatus(`Room code: ${code}`);
    }

    async joinPrivateRoom(rawCode) {
        const pairEls = await this.getPairEls();
        const parsed = this.parseRoomCode(rawCode);
        if (!parsed) {
            pairEls.screen1.self.querySelector("#room-code").focus();
            return;
        }

        await this.connectET();
        this.mode = pairEls.screen1.mode;
        this.teamMode = pairEls.screen1.teamMode;
        this.battlefield = pairEls.screen1.battlefield;
        this.RoomID = makeRoomId();
        this.isPrivate = true;
        this.pairingActive = true;
        this.verifyCode = parsed.verifyCode;
        this.CurStat = this.Stats.InRoom;
        this.players = [this.selfPlayer()];
        this.peerList = [parsed.peerId];
        this.leaderPeerId = parsed.peerId;
        this.startPeerSync();

        pairEls.screen1.self.style.display = "none";
        pairEls.screen2.self.style.display = "flex";
        pairEls.screen2.statusText.innerText = "Joining private room...";
        this.renderPlayers();
        this.sendRequestPair(parsed.peerId);
    }

    parseRoomCode(rawCode) {
        const cleaned = String(rawCode || "")
            .trim()
            .replace(/^0x/i, "")
            .replace(/\s+/g, "");
        if (!/^[0-9a-fA-F]{10}$/.test(cleaned)) {
            this.setStatus("Invalid room code.");
            return null;
        }

        const peerId = parseInt(cleaned.slice(0, 8), 16);
        const verifyCode = parseInt(cleaned.slice(8), 16);
        if (!peerId) {
            this.setStatus("Invalid room code.");
            return null;
        }
        return { peerId, verifyCode };
    }

    startPeerSync() {
        if (this.peerSyncTimer) clearInterval(this.peerSyncTimer);
        this.peerSyncTimer = setInterval(() => this.syncObservedPeers(), PEER_SYNC_INTERVAL_MS);
        this.syncObservedPeers();
    }

    syncObservedPeers() {
        if (!this.etconnected || !this.RoomID) return;
        const observed = easytier.listPeers().map((peer) => peer.id);
        if (!observed.length) {
            this.scanNearbyPublicPeers();
            this.updateRoomStatus();
            return;
        }
        uniqueNumbers([...observed, ...this.peerList]).forEach((peerId) => {
            if (peerId === this.localPeerId()) return;
            if (this.isLeader()) {
                this.sendRequestPair(peerId);
            } else {
                this.sendPairMessage(peerId, PACKET_TYPES.SyncPair, this.roomSnapshot());
            }
        });
        this.updateRoomStatus();
    }

    async scanNearbyPublicPeers() {
        if (this.isPrivate || this.publicScanBusy || !this.isLeader()) return;
        this.publicScanBusy = true;
        const localPeerId = this.localPeerId();
        const start = Math.max(1, localPeerId - PUBLIC_SCAN_RADIUS);
        const end = Math.min(0xffffffff, localPeerId + PUBLIC_SCAN_RADIUS);
        try {
            const peers = await easytier.scanPeerIds({
                start,
                end,
                timeoutMs: 1200,
                maxCount: PUBLIC_SCAN_RADIUS * 2 + 1,
            });
            peers.forEach((peer) => this.sendRequestPair(peer.peerId));
        } catch (error) {
            console.warn("Public peer scan failed:", error);
        } finally {
            this.publicScanBusy = false;
        }
    }

    sendRequestPair(peerId) {
        this.sendPairMessage(peerId, PACKET_TYPES.RequestPair, {
            verifyCode: this.isPrivate ? this.verifyCode : PUBLIC_VERIFY_CODE,
            room: this.roomSnapshot(),
            player: this.selfPlayer(),
        });
    }

    handlePacket(packet) {
        const message = parsePairPayload(packet);
        if (!message) return;

        switch (message.type) {
            case PACKET_TYPES.RequestPair:
                this.handlePairRequest(packet.fromPeerId, message.data);
                break;
            case PACKET_TYPES.RefusePair:
                this.setStatus(message.data?.reason || "Pair request refused.");
                break;
            case PACKET_TYPES.AcceptPair:
                this.acceptRoom(message.data, packet.fromPeerId);
                break;
            case PACKET_TYPES.RedirectPair:
                this.handleRedirect(message.data);
                break;
            case PACKET_TYPES.UpdatePair:
            case PACKET_TYPES.SyncPair:
                this.syncRoom(message.data, packet.fromPeerId);
                break;
            case PACKET_TYPES.TeamChange:
                this.handleTeamChange(message.data);
                break;
            case PACKET_TYPES.StartBattle:
                this.handleStartBattle(packet.fromPeerId, message.data);
                break;
        }
    }

    handlePairRequest(peerId, data) {
        if (!this.RoomID) {
            return;
        }
        const incomingRoom = data?.room || {};
        const incomingPlayers = Array.isArray(incomingRoom.players)
            ? incomingRoom.players.map(normalizePlayer)
            : [];
        const incomingPeerList = uniqueNumbers(incomingRoom.peerList || []);

        if (!this.isLeader()) {
            this.sendPairMessage(peerId, PACKET_TYPES.RedirectPair, {
                leaderPeerId: this.peerList[0] || this.leaderPeerId,
                room: this.roomSnapshot(),
            });
            return;
        }

        if (this.isPrivate && Number(data?.verifyCode) !== this.verifyCode) {
            this.sendPairMessage(
                peerId,
                PACKET_TYPES.RefusePair,
                { reason: "Verification code mismatch." },
                true,
            );
            return;
        }

        const mergedPlayers = mergePlayers(
            this.players,
            mergePlayers(incomingPlayers, [data.player]),
        );
        const mergedPeerList = uniqueNumbers([
            ...this.peerList,
            ...incomingPeerList,
            peerId,
            this.localPeerId(),
        ]);

        if (mergedPlayers.length > this.maxPlayers()) {
            this.sendPairMessage(
                peerId,
                PACKET_TYPES.RefusePair,
                { reason: "Room is full for this mode." },
                true,
            );
            return;
        }

        this.peerList = mergedPeerList;
        this.leaderPeerId = this.peerList[0];
        this.players = this.teamMode === "manual"
            ? fillTeams(mergedPlayers, this.teamSize())
            : this.applyTeamPolicy(mergedPlayers);
        this.startVotes = this.startVotes.filter((peerId) =>
            this.players.some((player) => player.ETid === peerId),
        );
        this.sendPairMessage(peerId, PACKET_TYPES.AcceptPair, this.roomSnapshot(), true);
        this.broadcastRoomUpdate();
        this.showTeamScreen();
    }

    acceptRoom(snapshot, fromPeerId) {
        this.syncRoom(snapshot, fromPeerId);
        this.showTeamScreen();
    }

    handleRedirect(data) {
        const leaderPeerId = Number(data?.leaderPeerId);
        this.syncRoom(data?.room, leaderPeerId);
        if (leaderPeerId && leaderPeerId !== this.localPeerId()) {
            this.sendRequestPair(leaderPeerId);
        }
    }

    syncRoom(snapshot, fromPeerId = null) {
        if (!snapshot) return;
        if (Number(snapshot.mode) !== this.mode) return;

        const snapshotLeaderId = Number(snapshot.leaderPeerId || snapshot.peerList?.[0]);
        const senderPeerId = Number(fromPeerId || snapshotLeaderId);
        if (this.isLeader() && senderPeerId !== this.localPeerId()) return;
        if (
            !this.isLeader() &&
            this.leaderPeerId &&
            senderPeerId !== Number(this.leaderPeerId)
        ) {
            return;
        }
        if (
            this.isPrivate &&
            this.isLeader() &&
            Array.isArray(snapshot.peerList) &&
            !snapshot.peerList.includes(this.localPeerId())
        ) {
            return;
        }

        this.RoomID = snapshot.roomId || this.RoomID;
        this.battlefield = snapshot.battlefield || this.battlefield;
        this.teamMode = snapshot.teamMode || this.teamMode;
        this.peerList = uniqueNumbers(snapshot.peerList || this.peerList);
        if (!this.peerList.includes(this.localPeerId())) {
            this.peerList.push(this.localPeerId());
        }
        this.leaderPeerId = this.peerList[0] || this.leaderPeerId;
        const snapshotPlayers = Array.isArray(snapshot.players)
            ? snapshot.players.map(normalizePlayer)
            : [];
        const mergedPlayers = mergePlayers(this.players, snapshotPlayers);
        this.players = (this.teamMode === "manual"
            ? mergePlayers(mergedPlayers, snapshotPlayers)
            : this.applyTeamPolicy(mergedPlayers)
        ).slice(0, this.maxPlayers());
        this.startVotes = uniqueNumbers(snapshot.startVotes || this.startVotes).filter(
            (peerId) => this.players.some((player) => player.ETid === peerId),
        );
        this.CurStat = this.Stats.InRoom;
        this.renderPlayers();
        this.showTeamScreen();
    }

    applyTeamPolicy(players) {
        if (this.teamMode === "random") {
            return assignRandomTeams(players, this.teamSize());
        }
        return fillTeams(players, this.teamSize());
    }

    roomSnapshot() {
        return {
            roomId: this.RoomID,
            mode: this.mode,
            teamMode: this.teamMode,
            battlefield: this.battlefield,
            leaderPeerId: this.leaderPeerId,
            peerList: this.peerList,
            startVotes: this.startVotes,
            players: this.players,
        };
    }

    broadcastRoomUpdate() {
        const snapshot = this.roomSnapshot();
        this.peerList.forEach((peerId) => {
            this.sendPairMessage(peerId, PACKET_TYPES.UpdatePair, snapshot);
        });
    }

    async showTeamScreen() {
        const pairEls = await this.getPairEls();
        pairEls.screen2.self.style.display = "none";
        pairEls.screen3.self.style.display = "flex";
        this.renderTeams(pairEls);
    }

    async renderPlayers() {
        const pairEls = await this.getPairEls();
        pairEls.screen2.PlayerList.innerHTML = "";
        this.players.forEach((player) => {
            const row = document.createElement("div");
            row.className = "player-row";

            const status = document.createElement("span");
            status.className = "player-status";

            const name = document.createElement("span");
            name.className = "player-name";
            name.textContent = player.name;

            row.append(status, name);
            pairEls.screen2.PlayerList.appendChild(row);
        });
    }

    renderTeams(pairEls) {
        const localPeerId = this.localPeerId();
        const teamA = this.players.filter((player) => player.team === "A");
        const teamB = this.players.filter((player) => player.team === "B");

        this.renderTeam(pairEls.screen3.ourTeam, teamA, "A");
        this.renderTeam(pairEls.screen3.opponentTeam, teamB, "B");

        const startVotesRequired = this.requiredStartVotes();
        const localVoted = this.startVotes.includes(localPeerId);
        const roomPlayerCount = Math.max(this.players.length, this.peerList.length);
        pairEls.screen3.statusText.innerText =
            `Players ${roomPlayerCount}/${this.maxPlayers()} ` +
            `Start ${this.startVotes.length}/${startVotesRequired}`;
        pairEls.screen3.startBattle.disabled = localVoted || roomPlayerCount < 2;
        pairEls.screen3.startBattle.innerText = localVoted ? "READY" : "START";
        pairEls.screen3.createRoom.disabled = true;
    }

    renderTeam(container, players, team) {
        container.innerHTML = "";
        container.classList.remove("layout-1", "layout-2", "layout-3", "layout-4");
        container.classList.add(`layout-${Math.max(1, Math.min(4, players.length))}`);
        container.onclick = () => this.requestTeamChange(team);

        players.forEach((player) => {
            const slot = document.createElement("div");
            slot.className = "player-slot";
            slot.title = player.name;
            slot.textContent = player.name.slice(0, 2).toUpperCase();
            container.appendChild(slot);
        });
        for (let index = players.length; index < this.teamSize(); index++) {
            const slot = document.createElement("div");
            slot.className = "player-slot empty-slot";
            slot.title = "Empty slot";
            slot.textContent = "+";
            container.appendChild(slot);
        }
    }

    requestTeamChange(team) {
        if (this.teamMode !== "manual") return;

        const localPeerId = this.localPeerId();
        if (this.isLeader()) {
            this.handleTeamChange({ peerId: localPeerId, team });
            return;
        }
        this.sendPairMessage(this.peerList[0], PACKET_TYPES.TeamChange, {
            peerId: localPeerId,
            team,
        });
    }

    handleTeamChange(data) {
        if (!this.isLeader() || this.teamMode !== "manual") return;
        const peerId = Number(data?.peerId);
        const team = data?.team === "B" ? "B" : "A";
        const player = this.players.find((item) => item.ETid === peerId);
        if (!player || player.team === team) return;

        const targetCount = this.players.filter((player) => player.team === team).length;
        const currentTeam = player.team === "B" ? "B" : "A";
        let swapPeerId = null;
        if (targetCount >= this.teamSize()) {
            const swapPlayer = this.players.find(
                (item) => item.team === team && item.ETid !== peerId,
            );
            if (!swapPlayer) return;
            swapPeerId = swapPlayer.ETid;
        }

        this.players = this.players.map((item) =>
            item.ETid === peerId
                ? { ...item, team }
                : item.ETid === swapPeerId
                  ? { ...item, team: currentTeam }
                  : item,
        );
        this.startVotes = [];
        this.broadcastRoomUpdate();
        this.showTeamScreen();
    }

    startBattle(data) {
        const snapshot = data || this.roomSnapshot();
        sessionStorage.setItem("sessionId", snapshot.roomId);
        sessionStorage.setItem("matchId", snapshot.roomId);
        sessionStorage.setItem("battlefield", snapshot.battlefield || "air.map");
        sessionStorage.setItem("groupId", snapshot.roomId);
        sessionStorage.setItem("battlePeers", JSON.stringify(snapshot.peerList || []));
        sessionStorage.setItem("battlePlayers", JSON.stringify(snapshot.players || []));
        window.location.href =
            `battle.html?matchId=${encodeURIComponent(snapshot.roomId)}` +
            `&battlefield=${encodeURIComponent(snapshot.battlefield || "air.map")}`;
    }

    handleStartBattle(fromPeerId, data) {
        if (data?.startNow) {
            if (Number(fromPeerId) !== Number(this.peerList[0])) return;
            this.startBattle(data);
            return;
        }
        const voterPeerId = Number(data?.peerId || fromPeerId || this.localPeerId());
        if (!this.peerList.includes(voterPeerId)) return;
        if (Math.max(this.players.length, this.peerList.length) < 2) return;
        if (!this.startVotes.includes(voterPeerId)) {
            this.startVotes.push(voterPeerId);
        }
        if (!this.isLeader()) {
            this.sendPairMessage(this.peerList[0], PACKET_TYPES.StartBattle, {
                peerId: voterPeerId,
            });
            this.showTeamScreen();
            return;
        }
        if (this.startVotes.length >= this.requiredStartVotes()) {
            const snapshot = { ...this.roomSnapshot(), startNow: true };
            this.peerList.forEach((peerId) => {
                this.sendPairMessage(peerId, PACKET_TYPES.StartBattle, snapshot);
            });
            this.startBattle(snapshot);
            return;
        }
        this.broadcastRoomUpdate();
        this.showTeamScreen();
    }

    hostStartBattle() {
        const localPeerId = this.localPeerId();
        this.handleStartBattle(localPeerId, { peerId: localPeerId });
    }

    async setStatus(text) {
        const pairEls = await this.getPairEls();
        pairEls.screen2.statusText.innerText = text;
        pairEls.screen3.statusText.innerText = text;
    }

    async updateRoomStatus() {
        const pairEls = await this.getPairEls();
        const observedCount = easytier.listPeers().length;
        const prefix = this.isPrivate
            ? `Room ${this.RoomID}`
            : `Public pairing, observed ${observedCount}`;
        const text =
            `${prefix}. Players ${this.players.length}/${this.maxPlayers()}. ` +
            `Leader ${this.peerList[0] || "-"}.`;
        // pairEls.screen2.statusText.innerText = text;
        if (pairEls.screen3.self.style.display !== "none") {
            pairEls.screen3.statusText.innerText = text;
        }
    }
}

const pairingHandler = new PairingHandlerClass();

document.addEventListener("DOMContentLoaded", function () {
    const startFightBtn = document.getElementById("start-fight");
    const newRoomBtn = document.getElementById("new-room");
    const joinRoomBtn = document.getElementById("join-room");
    const roomCodeInput = document.getElementById("room-code");
    const startBattleBtn = document.getElementById("start-battle");

    startFightBtn?.addEventListener("click", () => pairingHandler.publicPair());
    newRoomBtn?.addEventListener("click", () => pairingHandler.privatePair());
    joinRoomBtn?.addEventListener("click", () =>
        pairingHandler.joinPrivateRoom(roomCodeInput.value),
    );
    roomCodeInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            pairingHandler.joinPrivateRoom(roomCodeInput.value);
        }
    });
    startBattleBtn?.addEventListener("click", () =>
        pairingHandler.hostStartBattle(),
    );
});

(async () => {
    const cache = await caches.open("cache");
    const cachedFiles = [
        "images/block.webp",
        "images/bushes.webp",
        "images/ground.webp",
        "images/water.webp",
        "images/skins.png",
        "images/skills.png",
    ];

    for (const file of cachedFiles) {
        if (!(await cache.match(file))) await cache.add(file);
    }
})();

pairingHandler.connectET().catch((error) => {
    console.error("Failed to connect EasyTier:", error);
});

setInterval(function () {
    sessionStorage.setItem("bgmtime", music.currentTime);
}, 50);

/* ============================================
   Pair/Battle Page Script
   ============================================ */

using("/js/easytier.js");
using("/js/crypto.js");

const music = document.getElementById("background-music");
music.currentTime = sessionStorage.getItem("bgmtime") || 0;
music.play().catch(() => {});

// Load available maps
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



class PairingHandlerClass {
    constructor() {
        this.CurStats = {
            ETloading: 0,
            PrivateRoom: 1,
            OpenToPublic: 2,
            InRoom: 3,
        }
        this.CurStat = this.CurStats.ETloading;
        this.RoomID = "";
        this.etconnected = false;
        this.teamMates = [];
    }

    async connectET() {
        if (this.etconnected) return;
        var ETLoaded = false;
        while (!ETLoaded) {
            ETLoaded = typeof easytier != "undefined";
        }
        await easytier.connect(
            location.protocol == "https:" ? "wss" : "ws",
            localStorage.getItem("etserver") || "cn-sh-0.s.syntropica.top",
            location.protocol == "https:" ? 11011 : 11012,
            "skillbound", ""
        );
        while (!easytier.connected) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        this.etconnected = true;
        this.ETPingInterval = setInterval(() => {
            easytier.ping();
        }, 5000);
    }

    async getPairEls() {
        var pairEls = {};
        pairEls.screen1 = {};
        pairEls.screen2 = {};
        pairEls.screen3 = {};

        pairEls.screen1.self = document.getElementById("screen1");
        pairEls.screen2.self = document.getElementById("screen2");
        pairEls.screen3.self = document.getElementById("screen3");

        pairEls.screen1.mode = parseInt(document.getElementById("mode-choice").value);
        pairEls.screen1.battlefield = document.getElementById("map-choice").value;

        pairEls.screen2.PlayerList = document.getElementById("connected-players");
        pairEls.screen2.statusText = document.getElementById("status-text-screen2");

        pairEls.screen3.ourTeam = document.getElementById("our-team");
        pairEls.screen3.opponentTeam = document.getElementById("opponent-team");
        pairEls.screen3.statusText = document.getElementById("status-text-screen3");
        return pairEls;
    }

    async startPairing() {
        await connectET();
        pairEls.screen1.self.style.display = "none";
        pairEls.screen2.self.style.display = "flex";
        this.CurStat = this.CurStats.OpenToPublic;
        this.RoomID = generateRandomBase32Secret(20);
        this.teamMates = [];
        this.teamMates.push({
            'name': localStorage.getItem("userid") || "Player",
            'ETid': easytier.status().localPeerId
        });
    }

    async publicPair() {
        var pairEls = await this.getPairEls();
        await this.startPairing();
    }
    
    async privatePair() {
        var pairEls = await this.getPairEls();
        await this.startPairing();
    }

}

const pairingHandler = new PairingHandlerClass();

// Attach event listener to start fight button
document.addEventListener("DOMContentLoaded", function () {
    const startFightBtn = document.getElementById("start-fight");
    const newRoomBtn = document.getElementById("new-room");
    if (startFightBtn) {
        startFightBtn.addEventListener("click", () => pairingHandler.publicPair());
    }
    if (newRoomBtn) {
        newRoomBtn.addEventListener("click", () => pairingHandler.privatePair());
    }
});

// Cache image files for offline support
(async () => {
    const cache = await caches.open("cache");
    const cachedFiles = [
        "images/block.webp",
        "images/bush.webp",
        "images/bushes.webp",
        "images/fire.webp",
        "images/ground.webp",
        "images/water.webp",
        "images/skins.webp",
        "images/skills.webp",
    ];

    for (const file of cachedFiles) {
        if (!(await cache.match(file))) {
            await cache.add(file);
        }
    }
})();

connectET();

// Track music playback time
setInterval(function () {
    sessionStorage.setItem(
        "bgmtime",
        document.getElementById("background-music").currentTime,
    );
}, 50);



// ==================================================
//                   ET LISTENERS
// ==================================================

easytier.on("packet", (packet) => {
    if (packet.type == easytier.PacketType.RPC_REQUEST) {
        try {
            data = JSON.parse(new TextDecoder().decode(packet.payload));
        } catch (e) {
            return;
        }
        
    }
});

/* ============================================
   Pair/Battle Page Script
   ============================================ */

const music = document.getElementById("background-music");
music.currentTime = sessionStorage.getItem("bgmtime") || 0;
music.play().catch(() => {});

// Load available maps
fetch("maps/index.json")
    .then(response => response.json())
    .then(maps => {
        const mapSelect = document.getElementById("map-choice");
        maps.forEach(map => {
            const option = document.createElement("option");
            option.value = map;
            option.textContent = map.toUpperCase().replace(".MAP", "");
            mapSelect.appendChild(option);
        });
    })
    .catch(error => console.error("Failed to load maps:", error));

// Main pairing function
async function pair() {
    const mode = parseInt(document.getElementById("mode-choice").value);
    const battlefield = document.getElementById("map-choice").value;
    const screen1 = document.getElementById("screen1");
    const screen2 = document.getElementById("screen2");
    const ourTeam = document.getElementById("our-team");
    const opponentTeam = document.getElementById("opponent-team");

    // Switch screen display
    screen1.style.display = "none";
    screen2.style.display = "flex";

    // Clear and set layout classes
    ourTeam.innerHTML = '';
    opponentTeam.innerHTML = '';
    ourTeam.className = `team-container ours layout-${mode}`;
    opponentTeam.className = `team-container opponent layout-${mode}`;
    
    const statusBox = document.getElementById("status-text");
    statusBox.innerHTML = '<span id="loading-animation"></span>Connecting to server';
    statusBox.setAttribute('data-translated', 'false');
    
    // WebSocket connection to server
    const socket = new WebSocket(sessionStorage.getItem("WSServer"));

    socket.onerror = (error) => {
       console.error("WebSocket error:", error);
       statusBox.innerHTML = "Connection error. Please try again later. Error:"+error;
    };
   
    socket.onopen = () => {
        statusBox.innerHTML = '<span id="loading-animation"></span>Connected. Waiting for match';
        statusBox.setAttribute('data-translated', 'false');
        console.log("WebSocket connection established.");
        
        // Send pairing request
        socket.send(JSON.stringify({
            action: "start_pairing",
            mode: mode,
            battlefield: battlefield,
            userId: localStorage.getItem("userid")
        }));
    };
    
    const storeSession = (sessionId) => {
        if (!sessionId) return;
        sessionStorage.setItem("sessionId", sessionId);
        sessionStorage.setItem("matchId", sessionId);
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "paired") {
            sessionStorage.setItem("groupId", data.groupId);
            sessionStorage.setItem("myTeam", data.myTeam);
            sessionStorage.setItem("myId", data.myId);
            storeSession(data.matchId || data.sessionId || data.groupId);
            if (data.battlefield) {
                sessionStorage.setItem("battlefield", data.battlefield);
            }
        } else if (data.type === "add_player") {
            // Update matching status
            const player = document.createElement("div");
            player.className = "player-slot";
            const label = document.createElement("small");
            label.style.fontSize = "10px";
            label.textContent = data.playerName;
            player.appendChild(label);
            
            if (data.playerTeam === sessionStorage.getItem("myTeam")) {
                ourTeam.appendChild(player);
            } else {
                opponentTeam.appendChild(player);
            }
        } else if (data.type === "pairing_complete") {
            // Pairing complete, show player info
            statusBox.innerText = "Match Found!";
            statusBox.setAttribute('data-translated', 'false');
            document.getElementById("start-battle").disabled = false;
            document.getElementById("start-battle").onclick = () => {
                const sessionId = data.matchId || data.sessionId || sessionStorage.getItem("sessionId");
                storeSession(sessionId);
                if (data.battlefield) {
                    sessionStorage.setItem("battlefield", data.battlefield);
                }
                // Enter battle interface
                const query = new URLSearchParams();
                if (sessionId) query.set("sessionId", sessionId);
                if (data.battlefield) query.set("battlefield", data.battlefield);
                window.location.href = "battle.html" + (query.toString() ? "?" + query.toString() : "");
            };
        }
    };
}

// Attach event listener to start fight button
document.addEventListener('DOMContentLoaded', function() {
    const startFightBtn = document.getElementById("start-fight");
    if (startFightBtn) {
        startFightBtn.addEventListener('click', pair);
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
        "images/skins.back.webp",
        "images/skins.front.webp",
        "images/skins.left.webp",
        "images/skins.right.webp",
    ];
    
    for (const file of cachedFiles) {
        if (!await cache.match(file)) {
            await cache.add(file);
        }
    }
})();

// Track music playback time
setInterval(function() {
    sessionStorage.setItem("bgmtime", document.getElementById("background-music").currentTime)
}, 50);

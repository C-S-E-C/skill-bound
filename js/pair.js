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
    statusBox.innerText = "Connecting to server...";
    
    // WebSocket connection to server
    const socket = new WebSocket(sessionStorage.getItem("WSServer")).catch(error => statusBox.innerText = "WebSocket Error: " + error);
    
    socket.onopen = () => {
        statusBox.innerText = "Connected. Waiting for match...";
        console.log("WebSocket connection established.");
        
        // Send pairing request
        socket.send(JSON.stringify({
            action: "start_pairing",
            mode: mode,
            battlefield: battlefield,
            userId: localStorage.getItem("userid")
        }));
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "paired") {
            sessionStorage.setItem("groupId", data.groupId);
            sessionStorage.setItem("myTeam", data.playerId);
            sessionStorage.setItem("myId", data.myId);
        } else if (data.type === "add_player") {
            // Update matching status
            const player = document.createElement("div");
            player.className = "player-slot";
            player.innerHTML = `<small style="font-size:10px">${data.playerName}</small>`;
            
            if (data.playerTeam === sessionStorage.getItem("myTeam")) {
                ourTeam.appendChild(player);
            } else {
                opponentTeam.appendChild(player);
            }
        } else if (data.type === "pairing_complete") {
            // Pairing complete, show player info
            statusBox.innerText = "Match Found!";
            document.getElementById("start-fight").disabled = false;
            document.getElementById("start-fight").onclick = () => {
                // Enter battle interface
                window.location.href = "battle.html?matchId=" + data.matchId;
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
        "images/skins.webp",
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

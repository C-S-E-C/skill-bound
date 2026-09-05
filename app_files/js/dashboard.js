/* ============================================
   Dashboard Page Script
   ============================================ */
var coins, energy;
// Authentication check
if (localStorage.getItem("userid") == null) {
    window.location.href = "login.html";
}

// Get DOM elements
const bgMusic = document.getElementById("background-music");

// Initialize music
document.getElementById("background-music").currentTime =
    sessionStorage.getItem("bgmtime") || 0;
document.getElementById("background-music").play();

// Update UI with user stats
function updateEconomy() {
    economy = JSON.parse(atob(localStorage.getItem("economy").split(".")[1]));
    document.getElementById("coins").innerHTML =
        "🪙 " + economy["coins"] + "&nbsp;+";
    document.getElementById("energy").innerHTML =
        "🔋 " + economy["energy"] + "&nbsp;+";
}

// Update stats every second
setInterval(() => {
    updateEconomy();
}, 1000);

// Track music playback time
setInterval(function () {
    sessionStorage.setItem(
        "bgmtime",
        document.getElementById("background-music").currentTime,
    );
}, 50);

// Button event handlers
document.getElementById("map").addEventListener("click", function () {
    // Map functionality can be added here
    console.log("Map button clicked");
});

document.getElementById("manual").addEventListener("click", function () {
    // Manual/help functionality can be added here
    console.log("Manual button clicked");
});

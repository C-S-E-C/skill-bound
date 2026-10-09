/* ============================================
   Dashboard Page Script
   ============================================ */
var coins, energy;
// Authentication check
if (localStorage.getItem("userid") == null) {
    window.location.href = "login.html";
}

// Initialize music through the shell audio channel.
const audio = window.audioHandler;
if (localStorage.getItem("musicEnabled") !== "false") {
    audio?.play(sessionStorage.getItem("bgmtime") || 0);
}

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

window.addEventListener("audio-state", (event) => {
    sessionStorage.setItem("bgmtime", event.detail.currentTime);
});

// Button event handlers
document.getElementById("map").addEventListener("click", function () {
    // Map functionality can be added here
    console.log("Map button clicked");
});

document.getElementById("manual").addEventListener("click", function () {
    // Manual/help functionality can be added here
    console.log("Manual button clicked");
});

document.getElementById("settings").addEventListener("click", function () {
    const popup = window.open(
        "settings.html",
        "SettingsPopup",
        "width=400,height=300,top=100,left=100,scrollbars=yes,resizable=yes"
    );
    if (!popup) {
        console.warn("Settings popup was blocked by the browser.");
    }
});

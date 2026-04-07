/* ============================================
   Dashboard Page Script
   ============================================ */

// Check user authentication and initialize session storage
if (localStorage.getItem("to") == null) {
    window.location.href = "lang.html";
}
if (sessionStorage.getItem("coins") == null) {
    sessionStorage.setItem("coins", 0);
}
if (sessionStorage.getItem("energy") == null) {
    sessionStorage.setItem("energy", 0);
}

// Authentication check
if (localStorage.getItem("userid") == null) {
    window.location.href = "login.html";
}

// Get DOM elements
const bgMusic = document.getElementById("background-music");

// Initialize music
document.getElementById("background-music").currentTime = sessionStorage.getItem("bgmtime") || 0;
document.getElementById("background-music").play();

// Update UI with user stats
document.getElementById("coins").innerHTML = "🪙 " + sessionStorage.getItem("coins") + "&nbsp;⊕";
document.getElementById("energy").innerHTML = "🔋 " + sessionStorage.getItem("energy") + "&nbsp;⊕";

// Update stats every second
setInterval(() => {
    document.getElementById("coins").innerHTML = "🪙 " + sessionStorage.getItem("coins") + "&nbsp;⊕";
    document.getElementById("energy").innerHTML = "🔋 " + sessionStorage.getItem("energy") + "&nbsp;⊕";
}, 1000);

// Track music playback time
setInterval(function() {
    sessionStorage.setItem("bgmtime", document.getElementById("background-music").currentTime)
}, 50);

// Button event handlers
document.getElementById("map").addEventListener('click', function() {
    // Map functionality can be added here
    console.log("Map button clicked");
});

document.getElementById("manual").addEventListener('click', function() {
    // Manual/help functionality can be added here
    console.log("Manual button clicked");
});

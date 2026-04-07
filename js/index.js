/* ============================================
   Index Page Script
   ============================================ */

// Store initial data
localStorage.setItem('visited', 'yes');

// Check WebSocket support
if ("WebSocket" in window) {
    if (isWeChat()) {
        alert('Note: WeChat browser may not work properly with this application. It is highly recommended to use another browser to access it.\n\nPlease note: WeChat browser may not work properly with this application. It is highly recommended to use another browser to access it.');
    }
} else {
    document.write("Your browser does not support WebSockets. Please use a modern browser to access this application.\n\nYour browser does not support WebSockets. Please use a modern browser to access this application.");
}

const warningDiv = document.getElementById('warning');
const startBtn = document.getElementById('start-game');
const bgMusic = document.getElementById('background-music');
const logoDiv = document.getElementById('syntropica-logo');
const loadedElements = document.getElementsByClassName('loaded');

function playMusic() {
    if (bgMusic) {
        bgMusic.play().catch(function(e) {
            console.log('Music playback failed:', e);
        });
    }
}

function startGame() {
    warningDiv.style.display = 'none';
    playMusic();
    logoDiv.style.animationName = 'blur-in-and-out';
    logoDiv.style.animationDuration = '3s';
    logoDiv.style.animationTimingFunction = 'ease-in';
    logoDiv.style.animationFillMode = 'forwards';
}

startBtn.onclick = startGame;

logoDiv.addEventListener('animationend', function() {
    console.log('Animation ended');
    logoDiv.style.display = 'none';
    document.getElementById('syntropica-logo').style.display = 'none';
    Array.from(document.getElementsByClassName('loaded')).forEach(element => {
        element.style.display = 'block';
    });
    document.body.onclick = function() {
        window.location.href = 'login.html';
    }
});

setInterval(function() {
    sessionStorage.setItem("bgmtime", document.getElementById("background-music").currentTime)
}, 50);

// Load WebSocket server configuration
fetch('dynamic.json')
    .then(response => response.json())
    .then(data => {
        sessionStorage.setItem('WSServer', data.WSSever);
    })
    .catch(error => console.error('Failed to load dynamic configuration:', error));

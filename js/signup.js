/* ============================================
   Signup Page Script
   ============================================ */

// Handle WeChat browser issue
if (isWeChat()) {
    const secretDisplay = document.getElementById("secret-display");
    if (secretDisplay) {
        secretDisplay.style.overflow = "scroll";
    }
}

// Signup function
async function Signup() {
    const username = document.getElementById("username").value;
    if (!username) {
        alert("Please enter a username");
        return;
    }
    
    // Generate a new secret key
    const newSecret = generateRandomBase32Secret(1024);
    
    // Store in local storage
    localStorage.setItem('userid', username);
    localStorage.setItem('secret', newSecret);
    
    // Redirect to login page
    window.location.href = "login.html";
}

// Attach event listener to signup button
document.addEventListener('DOMContentLoaded', function() {
    const signupBtn = document.querySelector('#signup button');
    if (signupBtn) {
        signupBtn.addEventListener('click', Signup);
    }
});

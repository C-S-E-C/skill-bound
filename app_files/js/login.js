/* ============================================
   Login Page Script
   ============================================ */

// Check user authentication and redirect
const userId = localStorage.getItem("userid");

if (!userId) {
    window.location.href = "signup.html";
} else {
    window.location.href = "dashboard.html";
}

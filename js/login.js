/* ============================================
   Login Page Script
   ============================================ */

// Check user authentication and redirect
const userId = localStorage.getItem("userid");
const target = localStorage.getItem("to");

if (!userId) {
    window.location.href = "signup.html";
} else {
    window.location.href = target ? "dashboard.html" : "lang.html";
}

/* ============================================
   Language Selection Page Script
   ============================================ */

// Language data
const languages = [
    {"id":"en_us","name":"English"},
    {"id":"zh_hans","name":"中文 (简体)"},
    {"id":"zh_hant","name":"中文 (繁體)"},
];

// Change language function
function changeLanguage(lang) {
    console.log("Language changed to:", lang);
    localStorage.setItem("lang", lang);
    document.getElementById("continue").style.display = "block";
}

// Render language options
const selectelement = document.getElementById("lang-select");
for (var i = 0; i < languages.length; i++) {
    let lang = languages[i];
    let option = document.createElement("li");
    option.setAttribute("value", lang.id);
    option.onclick = () => changeLanguage(lang.id);
    option.innerText = lang.name;
    selectelement.appendChild(option);
}

// Search function
const langsearch = document.getElementById("lang-search");
let searchTimeout;
langsearch.addEventListener("input", function (e) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const search = e.target.value.toLowerCase();
        const options = selectelement.getElementsByTagName("li");
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            const matches = option.innerText.toLowerCase().includes(search) || option.getAttribute("value").toString().includes(search);
            option.style.display = matches ? "" : "none";
        }
    }, 150);
});

// Continue function
function continue_() {
    window.location.href = "login.html";
}

// Attach event listener to continue button
document.addEventListener('DOMContentLoaded', function() {
    const continueBtn = document.getElementById("continue");
    if (continueBtn) {
        continueBtn.addEventListener('click', continue_);
    }
});

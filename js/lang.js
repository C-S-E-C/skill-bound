/* ============================================
   Language Selection Page Script
   ============================================ */

// Language data
const languages = [
    {"id":"english","name":"English","serviceId":"en"},
    {"id":"chinese_simplified","name":"简体中文","serviceId":"zh-CN"},
    {"id":"spanish","name":"Español","serviceId":"es"},
    {"id":"french","name":"Français","serviceId":"fr"},
    {"id":"german","name":"Deutsch","serviceId":"de"},
    {"id":"russian","name":"Русский язык","serviceId":"ru"},
    {"id":"japanese","name":"日本語","serviceId":"ja"},
    {"id":"korean","name":"한국어","serviceId":"ko"}
];

// Change language function
function changeLanguage(lang) {
    console.log("Language changed to:", lang);
    translate.changeLanguage(lang);
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

// Setup translation system
translate.ignore.tag.push('li');
translate.listener.start();
translate.execute();

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

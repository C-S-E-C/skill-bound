(() => {
    const language = localStorage.getItem("lang");

    if (!language) {
        window.location.href = "lang.html";
        return;
    }


    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `/lang/${encodeURIComponent(language)}.css`;
    document.head.appendChild(stylesheet);
})();

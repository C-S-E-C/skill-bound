(async () => {
  try {
    const lang = localStorage.getItem("lang");

    if (lang == null) {
      window.location.href = "lang.html";
      return;
    }

    let translation = {};

    if (lang != "en_us") {
      const fetchResponse = await fetch("./lang/" + lang + ".json");
      translation = await fetchResponse.json();
    }

    const elements = document.querySelectorAll("h1, h2, h3, h4, h5, h6, p, span, a, button");
	var json = JSON.parse(localStorage.getItem("translation_cache") || "{}");
    elements.forEach(el => {
      const original = el.innerText;
	  json[original] = "";
      if (translation[original]) {
        console.info("Translating:\t", original, "\t->\t", translation[original]);
        el.innerText = translation[original];
      } else if (original.trim() !== "") {
        console.warn("No translation found for:", original);
      }
    });
    localStorage.setItem("translation_cache", JSON.stringify(json));

  } catch (error) {
    console.error("Translation failed:", error);
  }
})();

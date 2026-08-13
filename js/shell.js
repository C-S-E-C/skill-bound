(function () {
    "use strict";

    const DEFAULT_ICON =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="m8 10 3 2-3 2"/><path d="M13 15h4"/></svg>';
    const LEVELS = {
        log: "log",
        info: "info",
        warn: "warn",
        error: "error",
        debug: "debug",
    };

    let pipWindow = null;
    let activeTabId = null;
    let tabId = 0;
    const tabs = new Map();

    function formatValue(value) {
        if (typeof value === "string") return value;
        if (value instanceof Error) {
            return value.stack || value.message;
        }
        try {
            return JSON.stringify(value, null, 2);
        } catch (error) {
            return String(value);
        }
    }

    function formatLine(values) {
        return values.map(formatValue).join(" ");
    }

    function getDoc() {
        return pipWindow && !pipWindow.closed ? pipWindow.document : null;
    }

    function injectStyles(doc) {
        const style = doc.createElement("style");
        style.textContent = `
            * {
                box-sizing: border-box;
            }

            html,
            body {
                width: 100%;
                height: 100%;
                margin: 0;
                overflow: hidden;
                background: #101114;
                color: #f2f4f8;
                font-family: Consolas, Monaco, "Courier New", monospace;
            }

            .shell-root {
                display: grid;
                grid-template-columns: 48px minmax(0, 1fr);
                grid-template-rows: 34px minmax(0, 1fr);
                width: 100%;
                height: 100%;
                background: #101114;
            }

            .shell-title {
                grid-column: 1 / -1;
                display: flex;
                align-items: center;
                min-width: 0;
                padding: 0 10px;
                border-bottom: 1px solid #2a2d35;
                color: #ffffff;
                font: 700 13px/1 Arial, sans-serif;
                letter-spacing: 0;
            }

            .shell-sidebar {
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-height: 0;
                padding: 7px 6px;
                border-right: 1px solid #2a2d35;
                background: #171920;
            }

            .shell-tab-button {
                display: grid;
                place-items: center;
                width: 36px;
                height: 36px;
                padding: 0;
                border: 1px solid transparent;
                border-radius: 6px;
                background: transparent;
                color: #aeb6c3;
                cursor: pointer;
            }

            .shell-tab-button:hover {
                border-color: #3a3f4c;
                background: #222631;
                color: #ffffff;
            }

            .shell-tab-button.is-active {
                border-color: #4b8dff;
                background: #203356;
                color: #ffffff;
            }

            .shell-tab-button svg {
                width: 19px;
                height: 19px;
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            .shell-content {
                position: relative;
                min-width: 0;
                min-height: 0;
                background: #101114;
            }

            .shell-panel {
                position: absolute;
                inset: 0;
                display: none;
                overflow: auto;
                padding: 9px 10px;
                white-space: pre-wrap;
                word-break: break-word;
                font-size: 12px;
                line-height: 1.45;
            }

            .shell-panel.has-custom-html {
                white-space: normal;
                word-break: normal;
                font-family: Arial, sans-serif;
            }

            .shell-panel.is-active {
                display: block;
            }

            .shell-entry {
                margin: 0 0 4px;
                color: #d9dee8;
            }

            .shell-entry[data-level="info"] {
                color: #9dccff;
            }

            .shell-entry[data-level="warn"] {
                color: #ffd36a;
            }

            .shell-entry[data-level="error"] {
                color: #ff7b7b;
            }

            .shell-entry[data-level="debug"] {
                color: #a9a9ff;
            }
        `;
        doc.head.appendChild(style);
    }

    function renderWindow() {
        const doc = getDoc();
        if (!doc) return;

        doc.body.innerHTML = "";
        injectStyles(doc);

        const root = doc.createElement("div");
        root.className = "shell-root";

        const title = doc.createElement("div");
        title.className = "shell-title";
        title.textContent = "SHELL";

        const sidebar = doc.createElement("nav");
        sidebar.className = "shell-sidebar";
        sidebar.setAttribute("aria-label", "Shell tabs");

        const content = doc.createElement("main");
        content.className = "shell-content";

        root.append(title, sidebar, content);
        doc.body.appendChild(root);

        tabs.forEach((tab) => renderTab(tab));
        setActiveTab(activeTabId || tabs.keys().next().value);
    }

    function renderTab(tab) {
        const doc = getDoc();
        if (!doc) return;

        const sidebar = doc.querySelector(".shell-sidebar");
        const content = doc.querySelector(".shell-content");
        if (!sidebar || !content) return;

        let button = doc.querySelector(`[data-shell-button="${tab.id}"]`);
        if (!button) {
            button = doc.createElement("button");
            button.className = "shell-tab-button";
            button.type = "button";
            button.dataset.shellButton = tab.id;
            button.title = tab.title;
            button.innerHTML = tab.icon;
            button.addEventListener("click", () => setActiveTab(tab.id));
            sidebar.appendChild(button);
        }

        let panel = doc.querySelector(`[data-shell-panel="${tab.id}"]`);
        if (!panel) {
            panel = doc.createElement("section");
            panel.className = "shell-panel";
            panel.dataset.shellPanel = tab.id;
            panel.setAttribute("aria-label", tab.title);
            content.appendChild(panel);
        }

        panel.innerHTML = "";
        panel.classList.toggle("has-custom-html", tab.html !== "");
        if (tab.html !== "") {
            panel.innerHTML = tab.html;
        } else {
            tab.entries.forEach((entry) => appendEntry(tab, entry));
        }
    }

    function appendEntry(tab, entry) {
        const doc = getDoc();
        if (!doc) return;

        const panel = doc.querySelector(`[data-shell-panel="${tab.id}"]`);
        if (!panel) return;

        if (tab.html !== "") {
            tab.html = "";
            panel.innerHTML = "";
            panel.classList.remove("has-custom-html");
        }

        const line = doc.createElement("div");
        line.className = "shell-entry";
        line.dataset.level = entry.level;
        line.textContent = entry.message;
        panel.appendChild(line);
        panel.scrollTop = panel.scrollHeight;
    }

    function setActiveTab(id) {
        if (!tabs.has(id)) return null;

        activeTabId = id;
        const doc = getDoc();
        if (!doc) return tabs.get(id);

        doc.querySelectorAll(".shell-tab-button").forEach((button) => {
            button.classList.toggle(
                "is-active",
                button.dataset.shellButton === id,
            );
        });
        doc.querySelectorAll(".shell-panel").forEach((panel) => {
            panel.classList.toggle(
                "is-active",
                panel.dataset.shellPanel === id,
            );
        });

        return tabs.get(id);
    }

    function createTab(options) {
        const config =
            typeof options === "string" ? { title: options } : options || {};
        const id = config.id || `shell-tab-${++tabId}`;
        const tab = {
            id,
            title: config.title || "Shell",
            icon: config.icon || DEFAULT_ICON,
            html: config.innerHTML || "",
            entries: [],
            log: function () {
                return write("log", id, Array.from(arguments));
            },
            info: function () {
                return write("info", id, Array.from(arguments));
            },
            warn: function () {
                return write("warn", id, Array.from(arguments));
            },
            error: function () {
                return write("error", id, Array.from(arguments));
            },
            debug: function () {
                return write("debug", id, Array.from(arguments));
            },
            clear: function () {
                return clear(id);
            },
            activate: function () {
                return setActiveTab(id);
            },
        };

        Object.defineProperty(tab, "innerHTML", {
            get: function () {
                return tab.html;
            },
            set: function (value) {
                tab.html = String(value);
                renderTab(tab);
            },
        });

        tabs.set(id, tab);
        renderTab(tab);
        if (!activeTabId) setActiveTab(id);
        return tab;
    }

    function write(level, targetTabId, values) {
        let id = targetTabId;
        let args = values;

        if (!Array.isArray(args)) {
            args = Array.prototype.slice.call(arguments, 1);
            id = activeTabId;
        }

        const tab = tabs.get(id) || tabs.get(activeTabId);
        if (!tab) return null;

        const entry = {
            level: LEVELS[level] || "log",
            message: formatLine(args),
            time: new Date(),
        };
        tab.entries.push(entry);
        appendEntry(tab, entry);
        return entry;
    }

    async function open(options) {
        if (!("documentPictureInPicture" in window)) {
            throw new Error("documentPictureInPicture is not supported.");
        }

        if (pipWindow && !pipWindow.closed) {
            pipWindow.focus();
            return pipWindow;
        }

        pipWindow = await window.documentPictureInPicture.requestWindow({
            width: (options && options.width) || 520,
            height: (options && options.height) || 360,
        });
        pipWindow.addEventListener("pagehide", () => {
            pipWindow = null;
        });
        renderWindow();
        return pipWindow;
    }

    function clear(id) {
        const tab = tabs.get(id || activeTabId);
        if (!tab) return;
        tab.entries = [];
        renderTab(tab);
    }

    createTab({
        id: "default",
        title: "Shell",
        icon: DEFAULT_ICON,
    });

    window.shell = {
        open,
        createTab,
        setActiveTab,
        clear,
        log: function () {
            return write("log", activeTabId, Array.from(arguments));
        },
        info: function () {
            return write("info", activeTabId, Array.from(arguments));
        },
        warn: function () {
            return write("warn", activeTabId, Array.from(arguments));
        },
        error: function () {
            return write("error", activeTabId, Array.from(arguments));
        },
        debug: function () {
            return write("debug", activeTabId, Array.from(arguments));
        },
        write,
        get window() {
            return pipWindow;
        },
        get activeTab() {
            return tabs.get(activeTabId);
        },
        get tabs() {
            return Array.from(tabs.values());
        },
    };
})();

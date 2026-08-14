(function () {
    "use strict";

    const DEFAULT_ICON =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="m8 10 3 2-3 2"/><path d="M13 15h4"/></svg>';
    const NETWORK_ICON =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18h12"/><path d="M8 14h8"/><path d="M10 10h4"/><path d="M12 6h.01"/></svg>';
    const WEBRTC_ICON =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8a5 5 0 0 1 10 0"/><path d="M5 12a9 9 0 0 1 14 0"/><path d="M12 16h.01"/><path d="M4 20h16"/></svg>';
    const STATUS_ICON =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2-6 4 12 2-6h4"/><path d="M3 4h18v16H3z"/></svg>';
    const LEVELS = {
        log: "log",
        info: "info",
        warn: "warn",
        error: "error",
        debug: "debug",
    };
    const SHELL_TITLE = "SHELL";

    let pipWindow = null;
    let activeTabId = null;
    let tabId = 0;
    let hooksStarted = false;
    let easytierHooked = false;
    let webrtcHooked = false;
    let connectivityTimer = null;
    const easytierFilters = {
        packet: "all",
        peer: "all",
    };
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
                min-height: 0;
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
                overflow: hidden;
                background: #101114;
            }

            .shell-panel {
                position: absolute;
                inset: 0;
                display: none;
                overflow: hidden;
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
                display: flex;
                flex-direction: column;
                min-height: 0;
            }

            .shell-entry {
                margin: 0 0 4px;
                color: #d9dee8;
            }

            .shell-log-feed {
                flex: 1 1 auto;
                min-height: 0;
                overflow: auto;
                scrollbar-gutter: stable;
            }

            .shell-filterbar {
                flex: 0 0 auto;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
                margin: 0 0 8px;
                padding: 0 0 8px;
                border-bottom: 1px solid #2a2d35;
                white-space: normal;
            }

            .shell-filterbar label {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                color: #b9c2d0;
                font: 700 11px/1 Arial, sans-serif;
                letter-spacing: 0;
            }

            .shell-filterbar select {
                min-width: 132px;
                border: 1px solid #384052;
                border-radius: 5px;
                background: #151922;
                color: #f2f4f8;
                padding: 4px 6px;
                font: 12px/1 Consolas, Monaco, "Courier New", monospace;
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

            .shell-entry-prefix {
                display: flex;
                gap: 6px;
                align-items: center;
                margin-bottom: 3px;
                white-space: nowrap;
            }

            .shell-entry-badge {
                display: inline-block;
                margin-right: 7px;
                padding: 1px 6px;
                border: 1px solid #4b8dff;
                border-radius: 4px;
                background: #17233a;
                color: #9dccff;
                font-weight: 700;
                white-space: nowrap;
            }

            .connectivity-grid {
                display: grid;
                gap: 10px;
                padding: 2px;
                font-family: Consolas, Monaco, "Courier New", monospace;
            }

            .connectivity-card {
                border: 2px solid #4b8dff;
                border-radius: 6px;
                padding: 10px;
                background: #151922;
                color: #f2f4f8;
            }

            .connectivity-card[data-state="unsupported"] {
                border-color: #ff5f66;
            }

            .connectivity-card[data-state="available"] {
                border-color: #4b8dff;
            }

            .connectivity-card[data-state="active"] {
                border-color: #2fd36b;
            }

            .connectivity-card-title {
                margin-bottom: 6px;
                font: 700 13px/1 Arial, sans-serif;
                letter-spacing: 0;
            }

            .connectivity-line {
                margin: 3px 0;
                color: #b9c2d0;
                word-break: break-word;
            }
        `;
        doc.head.appendChild(style);
    }

    function updateWindowTitle() {
        const doc = getDoc();
        if (!doc) return;
        const title = doc.querySelector(".shell-title");
        const activeTab = tabs.get(activeTabId);
        if (title) title.textContent = activeTab ? activeTab.title : SHELL_TITLE;
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
        title.textContent = SHELL_TITLE;

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
            bindPanelScrollState(tab, panel);
        }

        panel.innerHTML = "";
        panel.classList.toggle("has-custom-html", tab.html !== "");
        if (tab.html !== "") {
            panel.innerHTML = tab.html;
        } else if (tab.id === "easytier") {
            renderEasyTierFilterBar(tab, panel);
            tab.entries.forEach((entry) => appendEntry(tab, entry));
        } else {
            const feed = doc.createElement("div");
            feed.className = "shell-log-feed";
            feed.dataset.shellFeed = tab.id;
            panel.appendChild(feed);
            tab.entries.forEach((entry) => appendEntry(tab, entry));
        }
    }

    function bindPanelScrollState(tab, panel) {
        tab.autoScroll = true;
        panel.addEventListener("pointerdown", () => {
            tab.autoScroll = false;
        });
        panel.addEventListener("wheel", () => {
            tab.autoScroll = false;
        }, { passive: true });
        panel.addEventListener("scroll", () => {
            const scroller = getScrollContainer(tab, panel);
            if (!scroller) return;
            tab.autoScroll =
                scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24;
        }, true);
    }

    function renderEasyTierFilterBar(tab, panel) {
        const doc = panel.ownerDocument;
        const bar = doc.createElement("div");
        bar.className = "shell-filterbar";
        bar.innerHTML =
            '<label>Packets <select id="easytier-packet-filter">' +
            '<option value="all">All packets</option>' +
            '<option value="pairing">Pairing packets</option>' +
            '<option value="non-pairing">Non-pairing packets</option>' +
            "</select></label>" +
            '<label>Peers <select id="easytier-peer-filter">' +
            '<option value="all">All peers</option>' +
            '<option value="no-server">Except server peer</option>' +
            '<option value="match-success">Only match success</option>' +
            "</select></label>";
        panel.appendChild(bar);

        const packetSelect = bar.querySelector("#easytier-packet-filter");
        const peerSelect = bar.querySelector("#easytier-peer-filter");
        packetSelect.value = easytierFilters.packet;
        peerSelect.value = easytierFilters.peer;
        packetSelect.addEventListener("change", () => {
            easytierFilters.packet = packetSelect.value;
            rerenderLogTab(tab);
        });
        peerSelect.addEventListener("change", () => {
            easytierFilters.peer = peerSelect.value;
            rerenderLogTab(tab);
        });

        const feed = doc.createElement("div");
        feed.className = "shell-log-feed";
        feed.dataset.shellFeed = tab.id;
        panel.appendChild(feed);
    }

    function rerenderLogTab(tab) {
        const panel = getPanel(tab.id);
        if (!panel) return;
        const previousScroll = getScrollContainer(tab, panel)?.scrollTop || 0;
        renderTab(tab);
        const scroller = getScrollContainer(tab, getPanel(tab.id));
        if (scroller) scroller.scrollTop = previousScroll;
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

        if (!entryMatchesTabFilters(tab, entry)) return;

        const line = doc.createElement("div");
        line.className = "shell-entry";
        line.dataset.level = entry.level;
        if (entry.meta?.prefix) {
            const prefix = doc.createElement("div");
            prefix.className = "shell-entry-prefix";
            entry.meta.prefix.forEach((part) => {
                const badge = doc.createElement("span");
                badge.className = "shell-entry-badge";
                badge.textContent = part;
                prefix.appendChild(badge);
            });
            line.appendChild(prefix);
            const body = doc.createElement("div");
            body.textContent = entry.message;
            line.appendChild(body);
        } else {
            line.textContent = entry.message;
        }
        const scroller = getScrollContainer(tab, panel);
        if (!scroller) return;
        const shouldStickToBottom =
            tab.autoScroll !== false &&
            scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24;
        scroller.appendChild(line);
        if (shouldStickToBottom) scroller.scrollTop = scroller.scrollHeight;
    }

    function getScrollContainer(tab, panel) {
        if (!panel) return null;
        return panel.querySelector(`[data-shell-feed="${tab.id}"]`) || panel;
    }

    function entryMatchesTabFilters(tab, entry) {
        if (tab.id !== "easytier") return true;
        const meta = entry.meta || {};
        if (easytierFilters.packet === "pairing" && !meta.isPairingPacket) return false;
        if (easytierFilters.packet === "non-pairing" && meta.isPairingPacket) return false;
        if (easytierFilters.peer === "no-server" && meta.isServerPeer) return false;
        if (easytierFilters.peer === "match-success" && !meta.isMatchSuccess) return false;
        return true;
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
        updateWindowTitle();

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
            autoScroll: true,
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
            getElementById: function (elementId) {
                const panel = getPanel(id);
                return panel ? panel.querySelector(`#${CSS.escape(elementId)}`) : null;
            },
            getelementbyid: function (elementId) {
                return tab.getElementById(elementId);
            },
            querySelector: function (selector) {
                const panel = getPanel(id);
                return panel ? panel.querySelector(selector) : null;
            },
            queryselector: function (selector) {
                return tab.querySelector(selector);
            },
            querySelectorAll: function (selector) {
                const panel = getPanel(id);
                return panel ? Array.from(panel.querySelectorAll(selector)) : [];
            },
            queryselectorall: function (selector) {
                return tab.querySelectorAll(selector);
            },
            get panel() {
                return getPanel(id);
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

    function getPanel(id) {
        const doc = getDoc();
        if (!doc) return null;
        return doc.querySelector(`[data-shell-panel="${id}"]`);
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
            meta: null,
        };
        tab.entries.push(entry);
        appendEntry(tab, entry);
        return entry;
    }

    function writeEntry(tab, level, values, meta) {
        const entry = {
            level: LEVELS[level] || "log",
            message: formatLine(values),
            time: new Date(),
            meta: meta || null,
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
            width: (options && options.width) || 760,
            height: (options && options.height) || 520,
        });
        pipWindow.addEventListener("pagehide", () => {
            pipWindow = null;
        });
        renderWindow();
        updateConnectivityPanel();
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
        title: SHELL_TITLE,
        icon: DEFAULT_ICON,
    });

    const easytierTab = createTab({
        id: "easytier",
        title: "EasyTier",
        icon: NETWORK_ICON,
    });
    const webrtcTab = createTab({
        id: "webrtc",
        title: "WebRTC",
        icon: WEBRTC_ICON,
    });
    const connectivityTab = createTab({
        id: "connectivity",
        title: "Connectivity",
        icon: STATUS_ICON,
        innerHTML:
            '<div class="connectivity-grid">' +
            '<section id="connectivity-easytier" class="connectivity-card" data-state="unsupported">' +
            '<div class="connectivity-card-title">EasyTier</div>' +
            '<div id="connectivity-easytier-state" class="connectivity-line">Not checked</div>' +
            '<div id="connectivity-easytier-detail" class="connectivity-line"></div>' +
            "</section>" +
            '<section id="connectivity-webrtc" class="connectivity-card" data-state="unsupported">' +
            '<div class="connectivity-card-title">WebRTC</div>' +
            '<div id="connectivity-webrtc-state" class="connectivity-line">Not checked</div>' +
            '<div id="connectivity-webrtc-detail" class="connectivity-line"></div>' +
            "</section>" +
            "</div>",
    });

    function appendTimed(tab, level, label, detail, meta) {
        return writeEntry(
            tab,
            level,
            [`[${new Date().toLocaleTimeString()}] ${label}`, detail || ""],
            meta,
        );
    }

    function readJsonPayload(packet) {
        if (!packet || packet.encrypted || !packet.payload) return null;
        try {
            return JSON.parse(new TextDecoder().decode(packet.payload));
        } catch (_) {
            return null;
        }
    }

    function packetTypeName(type) {
        const packetType = window.easytier && window.easytier.PacketType;
        if (!packetType) return String(type);
        const found = Object.keys(packetType).find((key) => packetType[key] === type);
        return found || String(type);
    }

    function easytierMeta(name, detail) {
        const status = window.easytier ? window.easytier.status() : null;
        const serverPeerId = status?.server?.peerId || status?.remotePeerId || null;
        const peerId = detail?.fromPeerId || detail?.toPeerId || detail?.id || detail?.peerId || null;
        const payload = name === "packet" ? readJsonPayload(detail) : null;
        const isPairingPacket =
            !!payload &&
            typeof payload.protocol === "string" &&
            payload.protocol.indexOf("skillbound.pairing") === 0;
        const packetData = payload?.data || {};
        return {
            isPairingPacket,
            isServerPeer: !!serverPeerId && Number(peerId) === Number(serverPeerId),
            prefix:
                name === "packet"
                    ? [
                          packetTypeName(detail.type),
                          `${detail.fromPeerId} -> ${detail.toPeerId}`,
                      ]
                    : null,
            isMatchSuccess:
                isPairingPacket &&
                (payload.type === 2 ||
                    payload.type === 4 ||
                    payload.type === 5 ||
                    Array.isArray(packetData.players)),
        };
    }

    function easytierDetail(name, detail) {
        if (name !== "packet") return detail;
        const payload = readJsonPayload(detail);
        return {
            encrypted: detail.encrypted,
            payload: payload || `<${detail.payloadLength || 0} bytes>`,
        };
    }

    function startRuntimeHooks() {
        if (hooksStarted) return;
        hooksStarted = true;

        const hookTimer = setInterval(() => {
            if (window.easytier && !easytierHooked) {
                easytierHooked = true;
                ["connected", "disconnected", "state", "error", "packet", "peer-observed", "scan-peer"].forEach((name) => {
                    window.easytier.on(name, (detail) => {
                        const level = name === "error" ? "error" : name === "state" ? "info" : "debug";
                        appendTimed(
                            easytierTab,
                            level,
                            name,
                            easytierDetail(name, detail),
                            easytierMeta(name, detail),
                        );
                        updateConnectivityPanel();
                    });
                });
                appendTimed(easytierTab, "info", "hooked", window.easytier.status());
                updateConnectivityPanel();
            }

            if (window.easytierWebRTC && !webrtcHooked) {
                webrtcHooked = true;
                ["open", "close", "message", "state", "peers", "signal-sent", "error"].forEach((name) => {
                    window.easytierWebRTC.on(name, (detail) => {
                        const level = name === "error" ? "error" : name === "open" ? "info" : "debug";
                        appendTimed(webrtcTab, level, name, detail);
                        updateConnectivityPanel();
                    });
                });
                appendTimed(webrtcTab, "info", "hooked", window.easytierWebRTC.status());
                updateConnectivityPanel();
            }

            if (window.easytier && window.easytierWebRTC) clearInterval(hookTimer);
        }, 300);

        connectivityTimer = setInterval(updateConnectivityPanel, 1000);
        updateConnectivityPanel();
    }

    function setConnectivityCard(kind, state, label, detail) {
        const tab = connectivityTab;
        const card = tab.getElementById(`connectivity-${kind}`);
        const stateEl = tab.getElementById(`connectivity-${kind}-state`);
        const detailEl = tab.getElementById(`connectivity-${kind}-detail`);
        if (!card || !stateEl || !detailEl) return;
        card.dataset.state = state;
        stateEl.textContent = label;
        detailEl.textContent = detail || "";
    }

    function updateConnectivityPanel() {
        const hasEasyTier = !!window.easytier;
        if (!hasEasyTier) {
            setConnectivityCard("easytier", "unsupported", "Unsupported", "window.easytier is missing");
        } else {
            const status = window.easytier.status();
            const active = status.connected || status.state === "connecting" || status.state === "handshaking";
            setConnectivityCard(
                "easytier",
                active ? "active" : "available",
                active ? `Using: ${status.state}` : "Supported, unused",
                `local=${status.localPeerId || "-"} peers=${status.observedPeers.length}`,
            );
        }

        const hasWebRTC = !!window.RTCPeerConnection && !!window.easytierWebRTC;
        if (!hasWebRTC) {
            setConnectivityCard(
                "webrtc",
                "unsupported",
                "Unsupported",
                !window.RTCPeerConnection ? "RTCPeerConnection is missing" : "window.easytierWebRTC is missing",
            );
        } else {
            const status = window.easytierWebRTC.status();
            const active = status.ready || status.peers.length > 0;
            setConnectivityCard(
                "webrtc",
                active ? "active" : "available",
                active ? "Using DataChannel" : "Supported, unused",
                `open=${status.openPeerIds.length} peers=${status.peers.length}`,
            );
        }
    }

    document.addEventListener("keydown", (event) => {
        if (event.defaultPrevented || event.repeat) return;
        if (event.key !== "`" && event.code !== "Backquote") return;
        event.preventDefault();
        open().catch((error) => {
            console.error("Failed to open shell:", error);
        });
    });

    startRuntimeHooks();

    window.shell = {
        open,
        createTab,
        setActiveTab,
        updateConnectivityPanel,
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

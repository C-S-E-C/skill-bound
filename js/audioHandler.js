/* Shared audio controller. The shell owns audio; iframe pages use MessageChannel. */
(function () {
    "use strict";

    const DEFAULT_SRC = "/app_files/music/waiting.mp3";

    class AudioController {
        constructor() {
            this.src = DEFAULT_SRC;
            this.audio = new Audio(this.src);
            this.audio.loop = true;
            this.audio.preload = "auto";
            this.audio.style.display = "none";
            (document.getElementById("audio-group") || document.body).appendChild(this.audio);
            this.ports = new Set();
            ["play", "pause", "timeupdate", "loadedmetadata", "ended"].forEach((name) => {
                this.audio.addEventListener(name, () => this.broadcast());
            });
            window.addEventListener("message", (event) => this.connect(event));
        }

        state() {
            return {
                type: "audio-state",
                playing: !this.audio.paused,
                currentTime: this.audio.currentTime || 0,
                duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0,
                muted: this.audio.muted,
                volume: this.audio.volume,
                src: this.src,
            };
        }

        broadcast() {
            const state = this.state();
            this.ports.forEach((port) => port.postMessage(state));
        }

        connect(event) {
            if (event.data?.type !== "audio-connect" || !event.ports[0]) return;
            const port = event.ports[0];
            this.ports.add(port);
            port.onmessage = ({ data }) => this.handle(data, port);
            port.start();
            port.postMessage({ type: "audio-ready", ...this.state() });
        }

        async handle(message, port) {
            if (!message || typeof message.type !== "string") return;
            try {
                switch (message.type) {
                    case "audio-play":
                        if (message.src && message.src !== this.src) {
                            this.src = message.src;
                            this.audio.src = message.src;
                        }
                        if (Number.isFinite(Number(message.currentTime))) {
                            this.audio.currentTime = Math.max(0, Number(message.currentTime));
                        }
                        await this.audio.play();
                        break;
                    case "audio-pause":
                        this.audio.pause();
                        break;
                    case "audio-seek":
                        this.audio.currentTime = Math.max(0, Number(message.currentTime) || 0);
                        break;
                    case "audio-volume":
                        this.audio.volume = Math.min(1, Math.max(0, Number(message.volume)));
                        break;
                    case "audio-mute":
                        this.audio.muted = Boolean(message.muted);
                        break;
                    case "audio-state":
                        port.postMessage(this.state());
                        return;
                    default:
                        return;
                }
                this.broadcast();
            } catch (error) {
                port.postMessage({ type: "audio-error", message: error?.message || String(error) });
            }
        }
    }

    class AudioClient {
        constructor() {
            const channel = new MessageChannel();
            this.port = channel.port1;
            this.state = { playing: false, currentTime: 0, duration: 0, muted: false, volume: 1 };
            this.port.onmessage = ({ data }) => {
                if (!data) return;
                if (data.type === "audio-state" || data.type === "audio-ready") {
                    this.state = { ...this.state, ...data };
                    window.dispatchEvent(new CustomEvent("audio-state", { detail: this.state }));
                }
                if (data.type === "audio-error") {
                    window.dispatchEvent(new CustomEvent("audio-error", { detail: data }));
                }
            };
            this.port.start();
            window.parent.postMessage({ type: "audio-connect" }, "*", [channel.port2]);
        }

        send(type, data = {}) { this.port.postMessage({ type, ...data }); }
        play(currentTime) { this.send("audio-play", { currentTime }); }
        pause() { this.send("audio-pause"); }
        seek(currentTime) { this.send("audio-seek", { currentTime }); }
        setVolume(volume) { this.send("audio-volume", { volume }); }
        setMuted(muted) { this.send("audio-mute", { muted }); }
        requestState() { this.send("audio-state"); }
    }

    window.audioHandler = window.top === window ? new AudioController() : new AudioClient();
})();

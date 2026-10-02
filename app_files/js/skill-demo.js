(() => {
    const canvas = document.getElementById("demo-canvas");
    const ctx = canvas.getContext("2d");
    const categoryFilter = document.getElementById("category-filter");
    const skillSelect = document.getElementById("skill-select");
    const levelSelect = document.getElementById("level-select");
    const replayButton = document.getElementById("replay-button");
    const state = { data: null, skill: null, startedAt: performance.now(), lastFrame: 0 };
    const colors = { fire: "#ff704d", ice: "#8ee9ff", lightning: "#ffe066", wind: "#8ff0ba", water: "#55b7ff", shadow: "#b18cff", beacon: "#fff3a6", rock: "#c3a27c", sand: "#e4bd72", forest: "#74d38d", time: "#b9a1ff", space: "#df87ff", soul: "#ff9bd1", poison: "#9ce36a", gold: "#ffd166" };
    const categories = { offense: "进攻", defense: "防守", support: "辅助", control: "控制", utility: "功能" };
    const shapes = { line: "直线", cone: "扇形", circle: "圆形", bounce: "弹射", self: "自身", target: "单体锁定", placed: "放置区域", wall: "墙体", teleport: "瞬移", trail: "自身轨迹", global: "全图" };

    fetch("data/skills.json")
        .then((response) => { if (!response.ok) throw new Error("skills.json load failed"); return response.json(); })
        .then((data) => { state.data = data; initControls(); renderInfo(); requestAnimationFrame(loop); })
        .catch((error) => { document.getElementById("status").textContent = error.message; });

    function initControls() {
        Object.entries(categories).forEach(([value, label]) => categoryFilter.add(new Option(label, value)));
        categoryFilter.addEventListener("change", refreshSkillOptions);
        skillSelect.addEventListener("change", () => { state.skill = state.data.skills.find((item) => item.id === skillSelect.value); restart(); renderInfo(); });
        levelSelect.addEventListener("change", renderInfo);
        replayButton.addEventListener("click", restart);
        refreshSkillOptions();
    }

    function refreshSkillOptions() {
        const category = categoryFilter.value;
        skillSelect.replaceChildren();
        state.data.skills.filter((item) => category === "all" || item.category === category).forEach((skill) => skillSelect.add(new Option(`${skill.name} (${skill.id})`, skill.id)));
        state.skill = state.data.skills.find((item) => item.id === skillSelect.value);
        restart(); renderInfo();
    }

    function restart() { state.startedAt = performance.now(); }

    function renderInfo() {
        const skill = state.skill;
        if (!skill) return;
        const profile = state.data.renderProfiles[skill.shape] || { collision: "custom", renderer: "placeholder" };
        document.getElementById("status").textContent = `${state.data.skills.length} skills / data-driven preview`;
        document.getElementById("skill-title").textContent = skill.name;
        document.getElementById("shape-label").textContent = `${shapes[skill.shape] || skill.shape} / ${profile.renderer}`;
        document.getElementById("info-name").textContent = skill.name;
        document.getElementById("info-id").textContent = skill.id;
        document.getElementById("info-meta").textContent = `${skill.element} / ${categories[skill.category] || skill.category}`;
        document.getElementById("info-cooldown").textContent = `${skill.cooldown}s`;
        document.getElementById("info-range").textContent = skill.range;
        document.getElementById("info-shape").textContent = `${shapes[skill.shape] || skill.shape} / ${skill.speed || "instant"}`;
        document.getElementById("info-level").textContent = skill.levels?.[Number(levelSelect.value)] || "该技能在玩法表中没有等级描述";
        document.getElementById("info-profile").textContent = JSON.stringify(profile, null, 2);
    }

    function loop(now) {
        const elapsed = (now - state.startedAt) / 1000;
        const phase = elapsed % 2.8;
        const progress = Math.min(1, phase / 1.8);
        drawScene(progress, phase);
        state.lastFrame = now;
        requestAnimationFrame(loop);
    }

    function drawScene(progress, phase) {
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        drawGrid(w, h);
        const skill = state.skill;
        if (!skill) return;
        const color = colors[skill.element] || "#66ddff";
        const origin = { x: 190, y: h / 2 };
        const target = { x: 760, y: h / 2 };
        drawUnit(origin.x, origin.y, "YOU", "#63e58b");
        drawUnit(target.x, target.y, "TARGET", "#ff759d");
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        switch (skill.shape) {
            case "line": drawLineSkill(origin, target, color, progress, phase); break;
            case "cone": drawConeSkill(origin, target, color, progress); break;
            case "circle": drawCircleSkill(target, color, progress); break;
            case "bounce": drawBounceSkill(origin, target, color, progress); break;
            case "wall": drawWallSkill(target, color, progress); break;
            case "placed": drawPlacedSkill(target, color, progress); break;
            case "target": drawTargetSkill(target, color, progress); break;
            case "teleport": drawTeleportSkill(origin, target, color, progress); break;
            case "trail": drawTrailSkill(origin, color, progress); break;
            case "global": drawGlobalSkill(target, color, progress); break;
            default: drawSelfSkill(origin, color, progress); break;
        }
        drawTimeline(progress, color);
    }

    function drawGrid(w, h) {
        ctx.strokeStyle = "rgba(142,161,187,.12)"; ctx.lineWidth = 1;
        for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    }

    function drawUnit(x, y, label, color) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#08101a"; ctx.font = "12px ui-monospace, Consolas, monospace"; ctx.textAlign = "center"; ctx.fillText(label, x, y - 28);
    }

    function drawLineSkill(origin, target, color, progress, phase) {
        ctx.strokeStyle = color; ctx.globalAlpha = 0.28; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(target.x, target.y); ctx.stroke(); ctx.globalAlpha = 1;
        const x = origin.x + (target.x - origin.x) * progress;
        ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(x, origin.y, 11 + Math.sin(phase * 10) * 2, 0, Math.PI * 2); ctx.fill();
        if (progress >= 1) drawShockwave(target.x, target.y, color, (phase - 1.8) / 1);
    }

    function drawConeSkill(origin, target, color, progress) {
        const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
        ctx.fillStyle = color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.arc(origin.x, origin.y, 250, angle - Math.PI / 4, angle + Math.PI / 4); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        for (let i = 0; i < 4; i++) { const a = angle - 0.35 + i * 0.23; drawBlade(origin.x + Math.cos(a) * 80 * progress, origin.y + Math.sin(a) * 80 * progress, a, color); }
    }

    function drawCircleSkill(target, color, progress) { drawShockwave(target.x, target.y, color, progress); }

    function drawBounceSkill(origin, target, color, progress) {
        const points = [{x: origin.x, y: origin.y}, {x: 390, y: 180}, {x: 570, y: 350}, target];
        ctx.strokeStyle = color; ctx.globalAlpha = 0.45; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y)); ctx.stroke(); ctx.globalAlpha = 1;
        const segment = Math.min(points.length - 2, Math.floor(progress * (points.length - 1))); const local = progress * (points.length - 1) - segment; const a = points[segment], b = points[segment + 1];
        ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * local, a.y + (b.y - a.y) * local, 10, 0, Math.PI * 2); ctx.fill();
        points.slice(1, segment + 1).forEach((p) => drawShockwave(p.x, p.y, color, 0.7));
    }

    function drawWallSkill(target, color, progress) { ctx.fillStyle = color; ctx.globalAlpha = 0.35; ctx.fillRect(target.x - 75, target.y - 90, 150, 180); ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.strokeRect(target.x - 75, target.y - 90, 150, 180); }
    function drawPlacedSkill(target, color, progress) { drawShockwave(target.x, target.y, color, 0.7 + progress * 0.3); ctx.setLineDash([8, 8]); ctx.strokeStyle = color; ctx.strokeRect(target.x - 60, target.y - 60, 120, 120); ctx.setLineDash([]); }
    function drawTargetSkill(target, color, progress) { ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(target.x, target.y, 28 + progress * 18, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(target.x - 48, target.y); ctx.lineTo(target.x + 48, target.y); ctx.moveTo(target.x, target.y - 48); ctx.lineTo(target.x, target.y + 48); ctx.stroke(); }
    function drawTeleportSkill(origin, target, color, progress) { ctx.strokeStyle = color; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(target.x, target.y); ctx.stroke(); ctx.setLineDash([]); drawShockwave(progress < 0.5 ? origin.x : target.x, progress < 0.5 ? origin.y : target.y, color, progress * 2); }
    function drawTrailSkill(origin, color, progress) { ctx.strokeStyle = color; ctx.lineWidth = 22; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(origin.x + 400 * progress, origin.y); ctx.stroke(); ctx.globalAlpha = 1; }
    function drawGlobalSkill(target, color, progress) { ctx.strokeStyle = color; ctx.globalAlpha = 0.7; ctx.lineWidth = 5; ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36); ctx.globalAlpha = 1; drawShockwave(target.x, target.y, color, progress); }
    function drawSelfSkill(origin, color, progress) { drawShockwave(origin.x, origin.y, color, progress); }

    function drawBlade(x, y, angle, color) { ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-16, -7); ctx.lineTo(-9, 0); ctx.lineTo(-16, 7); ctx.closePath(); ctx.fill(); ctx.restore(); }
    function drawShockwave(x, y, color, progress) { const radius = 24 + Math.max(0, Math.min(1, progress)) * 115; ctx.strokeStyle = color; ctx.globalAlpha = 0.75; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    function drawTimeline(progress, color) { ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(24, canvas.height - 26, canvas.width - 48, 4); ctx.fillStyle = color; ctx.fillRect(24, canvas.height - 26, (canvas.width - 48) * progress, 4); }
})();

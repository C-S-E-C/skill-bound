/* ============================================
   Battle Page Script
   WebSocket-based multiplayer battle client
   ============================================ */

// ---- Constants ----
const SLOT_COUNT = 8;
const MAX_HP = 300;
const BASIC_ATTACK_COOLDOWN_MS = 1000;
const REVIVE_CAST_TIME_MS = 8000;
const ATTRIBUTES = [
    { name: "烈火", icon: "🔥", desc: "命中附加燃烧" },
    { name: "寒冰", icon: "❄️", desc: "命中必定减速" },
    { name: "雷电", icon: "⚡", desc: "命中溅射伤害" },
    { name: "疾风", icon: "💨", desc: "移速+25%,CD-10%" },
    { name: "清水", icon: "💧", desc: "减伤10%,自动驱散" },
    { name: "暗影", icon: "🌑", desc: "脱战隐身突袭" },
    { name: "圣光", icon: "✨", desc: "持续生命回复" },
    { name: "大地", icon: "🪨", desc: "周期护甲防御" },
    { name: "自然", icon: "🌿", desc: "快速生命回复" },
    { name: "时空", icon: "⏳", desc: "所有CD-20%" },
    { name: "空间", icon: "🌀", desc: "受伤闪现位移" },
    { name: "灵魂", icon: "👁️", desc: "技能命中控制" },
];
const CAT_COLORS = {
    offensive: "#ff4444",
    defensive: "#4499ff",
    support: "#44ff88",
    control: "#ff8800",
    utility: "#cc88ff",
};
const STATUS_ICONS = {
    burn: "🔥", slowed: "🧊", frozen: "❄️", stunned: "💫",
    rooted: "🌿", silenced: "🔇", feared: "😱", sleeping: "💤",
    charmed: "💕", poison: "☠️", blinded: "🙈", marked: "🎯",
    invulnerable: "🛡️", dodge: "💨", stealth: "👻",
    dmg_boost: "⬆️", dmg_reduction: "🛡️", speed_boost: "⚡",
};
const HOTKEYS = ["1","2","3","4","5","6","7","8"];

// ---- State ----
let ws = null;
let myId = null;
let matchId = null;
let gameState = null;
let myPrivateState = null;
let selectedAttribute = null;
let selectedTarget = null;
let selectedInvSkills = [];      // for slot assignment
let synthSelectedIds = [];       // for synthesis
let pendingSlotAssign = -1;      // which slot to fill next from inventory click
let attackCooldownUntil = 0;
let revivingTargetId = null;
let reviveTimer = null;
let battleTimerInterval = null;
let battleStartTime = null;
let cdUpdateInterval = null;

// ---- Init ----
window.addEventListener("DOMContentLoaded", init);

function init() {
    // Read match params from URL / sessionStorage
    const params = new URLSearchParams(window.location.search);
    matchId = params.get("matchId") || sessionStorage.getItem("matchId");
    myId = localStorage.getItem("userid");

    if (!matchId || !myId) {
        setLoadingText("❌ 缺少比赛信息，请重新匹配");
        setTimeout(() => window.location.href = "pair.html", 2000);
        return;
    }

    const wsServer = sessionStorage.getItem("WSServer") || "ws://localhost:8765";
    connectWS(wsServer);
    buildAttributeGrid();
    buildSlotConfigGrid();
    setupEventListeners();
}

// ---- WebSocket ----
function connectWS(url) {
    setLoadingText("连接服务器中...");
    ws = new WebSocket(url);

    ws.onopen = () => {
        setLoadingText("认证中...");
        wsSend({ action: "join_match", matchId: matchId, userId: myId });
    };

    ws.onmessage = (evt) => {
        try {
            const msg = JSON.parse(evt.data);
            handleMessage(msg);
        } catch (e) {
            console.error("WS parse error", e);
        }
    };

    ws.onerror = () => setLoadingText("❌ 连接失败，请检查服务器");

    ws.onclose = () => {
        if (!gameState?.ended) {
            setLoadingText("⚠️ 连接断开，正在重连...");
            setTimeout(() => connectWS(url), 3000);
        }
    };
}

function wsSend(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ ...data, userId: myId, matchId: matchId }));
    }
}

// ---- Message Handling ----
function handleMessage(msg) {
    switch (msg.type) {
        case "match_joined":
            gameState = msg.state;
            myPrivateState = msg.private;
            showScreen("pregame");
            updatePreGame();
            break;

        case "game_start":
            gameState = msg.state;
            showScreen("battle");
            initBattleScreen();
            break;

        case "game_state":
            gameState = msg.state;
            updateBattleScreen();
            break;

        case "player_update":
            if (gameState) {
                gameState.players[msg.player.id] = msg.player;
                if (!gameState.started) updatePreGame();
                else updateBattleScreen();
            }
            break;

        case "player_ready":
            updateReadyStatus(msg.player_id, msg.player_name, true);
            break;

        case "skill_drawn":
            myPrivateState = msg;
            updateInventoryGrid();
            updateCoinsDisplay(msg.coins);
            addLogEntry(`🎲 抽到了 ${msg.skill.name} Lv${msg.skill.level}`, "skill-use");
            break;

        case "slots_configured":
            updateSkillBarFromSlots(msg.slots);
            break;

        case "attack_result":
            gameState = msg.state;
            addLogEntry(`⚔️ ${getPlayerName(msg.attacker)} 攻击 ${getPlayerName(msg.target)} → ${msg.damage}伤害${msg.is_crit ? " 💥暴击!" : ""}`, "damage");
            updateBattleScreen();
            break;

        case "skill_used":
            gameState = msg.state;
            addLogEntry(`✨ ${getPlayerName(msg.player_id)} 使用了 ${msg.skill_name} Lv${msg.skill_level}`, "skill-use");
            if (msg.player_id === myId) {
                updateSkillCooldownDisplay(msg.slot_index);
            }
            updateBattleScreen();
            break;

        case "player_downed":
            addLogEntry(`💔 ${msg.player_name} 倒地！队友可在30秒内救起！`, "death");
            updateBattleScreen();
            checkReviveButton();
            break;

        case "player_revived":
            gameState = msg.state;
            addLogEntry(`💚 ${getPlayerName(msg.reviver_id)} 救起了 ${getPlayerName(msg.target_id)}！`, "revive");
            if (revivingTargetId === msg.target_id) {
                cancelRevive();
            }
            updateBattleScreen();
            break;

        case "player_died":
            gameState = msg.state;
            addLogEntry(`💀 ${msg.player_name} 已死亡，掉落了 ${msg.dropped_skills?.length || 0} 个技能！`, "death");
            renderDroppedSkills(msg.dropped_skills || []);
            updateBattleScreen();
            break;

        case "skill_picked_up":
            myPrivateState.inventory = msg.inventory;
            updateInventoryGrid();
            addLogEntry(`📦 捡起了 ${msg.skill.name} Lv${msg.skill.level}`, "system");
            break;

        case "dropped_skill_taken":
            removeDroppedSkill(msg.skill_id);
            break;

        case "synthesis_result":
            myPrivateState.inventory = msg.inventory;
            updateInventoryGrid();
            addLogEntry(`⚗️ 合成了 ${msg.new_skill.name} Lv${msg.new_skill.level}！`, "skill-use");
            synthSelectedIds = [];
            updateSynthStatus();
            break;

        case "game_over":
            gameState = msg.state;
            showResultScreen(msg.winner_team, msg.rewards);
            break;

        case "error":
            showError(msg.message);
            break;

        default:
            console.log("Unknown message type:", msg.type, msg);
    }
}

// ---- Screens ----
function showScreen(name) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const id = name === "pregame" ? "pregame-screen"
             : name === "battle" ? "battle-screen"
             : name === "result" ? "result-screen"
             : "loading-screen";
    document.getElementById(id).classList.add("active");
}

function setLoadingText(text) {
    document.getElementById("loading-text").textContent = text;
}

// ---- Pre-game UI ----
function buildAttributeGrid() {
    const grid = document.getElementById("attribute-grid");
    grid.innerHTML = "";
    ATTRIBUTES.forEach(attr => {
        const card = document.createElement("div");
        card.className = "attr-card";
        card.dataset.name = attr.name;
        card.innerHTML = `<div class="attr-icon">${attr.icon}</div>
                          <div class="attr-name">${attr.name}</div>`;
        card.title = attr.desc;
        card.addEventListener("click", () => selectAttribute(attr.name));
        grid.appendChild(card);
    });
}

function buildSlotConfigGrid() {
    const grid = document.getElementById("slot-grid");
    grid.innerHTML = "";
    for (let i = 0; i < SLOT_COUNT; i++) {
        const slot = document.createElement("div");
        slot.className = "slot-config";
        slot.dataset.index = i;
        slot.innerHTML = `<div class="slot-num">槽 ${i+1}${i < 2 ? " 🔒" : ""}</div>
                          <div class="slot-skill-name">空</div>`;
        slot.addEventListener("click", () => onSlotConfigClick(i));
        grid.appendChild(slot);
    }
}

function selectAttribute(name) {
    selectedAttribute = name;
    document.querySelectorAll(".attr-card").forEach(c => {
        c.classList.toggle("selected", c.dataset.name === name);
    });
    // Enable ready button if attribute selected
    checkReadyBtn();
    wsSend({ action: "select_attribute", attribute: name });
}

function updatePreGame() {
    if (!gameState) return;
    const me = gameState.players?.[myId];
    updateCoinsDisplay(myPrivateState?.coins ?? 0);

    // Update ready status for all players
    const statusDiv = document.getElementById("ready-status");
    statusDiv.innerHTML = "";
    Object.values(gameState.players || {}).forEach(p => {
        const el = document.createElement("div");
        el.className = `ready-player team-${p.team} ${p.ready ? "ready" : ""}`;
        el.textContent = `${p.name} ${p.ready ? "✅" : "⏳"}`;
        statusDiv.appendChild(el);
    });

    checkReadyBtn();
}

function checkReadyBtn() {
    const btn = document.getElementById("ready-btn");
    btn.disabled = !selectedAttribute;
}

function updateInventoryGrid() {
    const grid = document.getElementById("inventory-grid");
    grid.innerHTML = "";
    const inv = myPrivateState?.inventory || [];
    inv.forEach(skill => {
        const el = document.createElement("div");
        el.className = "inv-skill";
        el.dataset.id = skill.id;
        const isForSynth = synthSelectedIds.includes(skill.id);
        if (isForSynth) el.classList.add("selected");
        el.style.borderColor = CAT_COLORS[skill.category] || "#888";
        const nameDiv = document.createElement("div");
        nameDiv.className = "skill-name";
        nameDiv.textContent = skill.name;
        const levelDiv = document.createElement("div");
        levelDiv.className = "skill-level";
        levelDiv.textContent = `Lv${skill.level}`;
        const catDiv = document.createElement("div");
        catDiv.className = "skill-cat";
        catDiv.textContent = skill.category;
        el.appendChild(nameDiv);
        el.appendChild(levelDiv);
        el.appendChild(catDiv);
        el.addEventListener("click", () => onInventorySkillClick(skill));
        el.addEventListener("mouseenter", (e) => showTooltip(skill, e));
        el.addEventListener("mouseleave", hideTooltip);
        grid.appendChild(el);
    });
    updateCoinsDisplay(myPrivateState?.coins ?? 0);
}

function onInventorySkillClick(skill) {
    if (pendingSlotAssign >= 0) {
        // Assign to pending slot
        assignSkillToSlot(skill, pendingSlotAssign);
        pendingSlotAssign = -1;
        document.querySelectorAll(".inv-skill").forEach(e => e.classList.remove("selected"));
        return;
    }
    // Toggle for synthesis
    const idx = synthSelectedIds.indexOf(skill.id);
    if (idx >= 0) {
        synthSelectedIds.splice(idx, 1);
    } else {
        synthSelectedIds.push(skill.id);
    }
    updateInventoryGrid();
    updateSynthStatus();
}

function onSlotConfigClick(slotIndex) {
    const inv = myPrivateState?.inventory || [];
    if (inv.length === 0) {
        showError("背包为空，请先抽取技能");
        return;
    }
    // Toggle: set pending slot assignment
    if (pendingSlotAssign === slotIndex) {
        pendingSlotAssign = -1;
        document.querySelector(`.slot-config[data-index="${slotIndex}"]`).style.outline = "";
    } else {
        pendingSlotAssign = slotIndex;
        document.querySelectorAll(".slot-config").forEach(e => e.style.outline = "");
        const slotEl = document.querySelector(`.slot-config[data-index="${slotIndex}"]`);
        slotEl.style.outline = "2px solid var(--neon-green)";
    }
}

// Build the slots array from current UI state and send to server
const _slotAssignments = new Array(SLOT_COUNT).fill(null);

function assignSkillToSlot(skill, slotIndex) {
    _slotAssignments[slotIndex] = { id: skill.id };
    const slotEl = document.querySelector(`.slot-config[data-index="${slotIndex}"]`);
    if (slotEl) {
        slotEl.classList.add("filled");
        slotEl.innerHTML = "";
        const numDiv = document.createElement("div");
        numDiv.className = "slot-num";
        numDiv.textContent = `槽 ${slotIndex + 1}${slotIndex < 2 ? " 🔒" : ""}`;
        const clearSpan = document.createElement("span");
        clearSpan.className = "clear-slot";
        clearSpan.textContent = "✕";
        clearSpan.addEventListener("click", (e) => clearSlot(slotIndex, e));
        const nameDiv = document.createElement("div");
        nameDiv.className = "slot-skill-name";
        nameDiv.textContent = skill.name;
        const lvlDiv = document.createElement("div");
        lvlDiv.className = "slot-skill-lvl";
        lvlDiv.textContent = `Lv${skill.level}`;
        slotEl.appendChild(numDiv);
        slotEl.appendChild(clearSpan);
        slotEl.appendChild(nameDiv);
        slotEl.appendChild(lvlDiv);
    }
    // Push updated slots to server
    wsSend({ action: "configure_slots", slots: _slotAssignments });
}

window.clearSlot = function(index, e) {
    e.stopPropagation();
    _slotAssignments[index] = null;
    const slotEl = document.querySelector(`.slot-config[data-index="${index}"]`);
    if (slotEl) {
        slotEl.classList.remove("filled");
        slotEl.innerHTML = `<div class="slot-num">槽 ${index+1}${index < 2 ? " 🔒" : ""}</div>
                            <div class="slot-skill-name">空</div>`;
    }
    wsSend({ action: "configure_slots", slots: _slotAssignments });
};

function updateSynthStatus() {
    const inv = myPrivateState?.inventory || [];
    const selected = inv.filter(s => synthSelectedIds.includes(s.id));
    const p = document.getElementById("synth-selected");
    if (selected.length === 0) {
        p.textContent = "从背包选择同类同级技能";
        return;
    }
    const names = [...new Set(selected.map(s => s.name))];
    const levels = [...new Set(selected.map(s => s.level))];
    if (names.length > 1) {
        p.textContent = `❌ 必须同种技能 (已选: ${names.join(", ")})`;
    } else if (levels.length > 1) {
        p.textContent = `❌ 必须同级技能`;
    } else {
        const req = { 1: 2, 2: 4, 3: 8 };
        const needed = req[levels[0]] || "?";
        p.textContent = `已选: ${selected.length}/${needed}个 ${names[0]} Lv${levels[0]}`;
    }
}

function updateReadyStatus(playerId, playerName, isReady) {
    if (gameState?.players && Object.hasOwn(gameState.players, playerId)) {
        gameState.players[playerId].ready = isReady;
    }
    updatePreGame();
}

function updateCoinsDisplay(coins) {
    const pg = document.getElementById("pg-coins");
    if (pg) pg.textContent = coins;
    const bc = document.getElementById("battle-my-coins");
    if (bc) bc.textContent = `🪙 ${coins}`;
    const drawBtn = document.getElementById("draw-skill-btn");
    if (drawBtn) drawBtn.disabled = coins < 20;
}

// ---- Battle Screen ----
function initBattleScreen() {
    if (!gameState) return;
    battleStartTime = Date.now();
    battleTimerInterval = setInterval(updateBattleTimer, 1000);
    cdUpdateInterval = setInterval(updateAllCooldowns, 250);

    buildSkillBar();
    updateBattleScreen();
    updateBattleMatchInfo();

    // Keyboard shortcuts for skill slots
    document.addEventListener("keydown", onKeyDown);
}

function updateBattleTimer() {
    if (!battleStartTime) return;
    const elapsed = Math.floor((Date.now() - battleStartTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    document.getElementById("battle-timer").textContent = `${m}:${s}`;
}

function updateBattleMatchInfo() {
    const el = document.getElementById("battle-match-info");
    if (gameState) {
        el.textContent = `${gameState.battlefield?.toUpperCase() || "MAP"} | ${gameState.mode}v${gameState.mode}`;
    }
}

function updateBattleScreen() {
    if (!gameState) return;
    renderTeams();
    updateSelfHpBar();
    updateCoinsDisplay(myPrivateState?.coins ?? 0);
    checkReviveButton();
    renderGameLog();
}

function renderTeams() {
    const teamA = document.getElementById("battle-team-a");
    const teamB = document.getElementById("battle-team-b");

    const firstLabelA = teamA.querySelector(".battle-team-label");
    const firstLabelB = teamB.querySelector(".battle-team-label");
    teamA.innerHTML = "";
    teamB.innerHTML = "";
    if (firstLabelA) teamA.appendChild(firstLabelA);
    else { const l = document.createElement("div"); l.className = "battle-team-label"; l.textContent = "🔵 队伍 A"; teamA.appendChild(l); }
    if (firstLabelB) teamB.appendChild(firstLabelB);
    else { const l = document.createElement("div"); l.className = "battle-team-label"; l.textContent = "🔴 队伍 B"; teamB.appendChild(l); }

    Object.values(gameState.players || {}).forEach(p => {
        const card = createPlayerCard(p);
        if (p.team === "A") teamA.appendChild(card);
        else teamB.appendChild(card);
    });
}

function createPlayerCard(player) {
    const card = document.createElement("div");
    card.className = "battle-player-card";
    card.dataset.playerId = player.id;

    if (player.id === myId) card.classList.add("me");
    if (player.is_downed) card.classList.add("downed");
    if (player.is_dead) card.classList.add("dead");
    if (selectedTarget === player.id) card.classList.add("selected-target");

    const hpPct = Math.max(0, (player.hp / player.max_hp) * 100);
    const hpColor = hpPct > 60 ? "var(--hp-bar-green)"
                  : hpPct > 30 ? "var(--hp-bar-yellow)"
                  : "var(--hp-bar-red)";

    // Status icons
    const effects = (player.status_effects || []).map(e => STATUS_ICONS[e.type] || "").filter(Boolean);
    const statusStr = effects.slice(0, 4).join("");

    let statusText = player.is_dead ? "💀 死亡" : player.is_downed ? "💔 倒地" : "";
    const shieldStr = player.shield > 0 ? `🛡️${player.shield}` : "";

    card.innerHTML = "";

    // Player name row
    const nameRow = document.createElement("div");
    nameRow.className = "player-card-name";

    const nameSpan = document.createElement("span");
    // Only emoji/constant text + player.name via textContent
    const attrIcon = player.attribute ? getAttrIcon(player.attribute) : "";
    const small = document.createElement("small");
    small.style.color = "var(--text-dim)";
    small.style.fontSize = "0.5rem";
    small.textContent = attrIcon;
    nameSpan.textContent = player.name + (player.id === myId ? " (我)" : "");
    nameSpan.appendChild(small);

    const statusSpan = document.createElement("span");
    statusSpan.className = "status-icons";
    // statusStr and shieldStr contain only safe emoji/numbers
    statusSpan.textContent = statusStr + shieldStr;

    nameRow.appendChild(nameSpan);
    nameRow.appendChild(statusSpan);

    // HP bar
    const hpBarWrap = document.createElement("div");
    hpBarWrap.className = "player-card-hp-bar-wrap";
    const hpBar = document.createElement("div");
    hpBar.className = "player-card-hp-bar";
    hpBar.style.width = hpPct + "%";
    hpBar.style.background = hpColor;
    hpBarWrap.appendChild(hpBar);

    // HP text
    const hpText = document.createElement("div");
    hpText.className = "player-card-hp-text";
    hpText.textContent = `${Math.max(0, player.hp)}/${player.max_hp} HP  ${statusText}`;

    card.appendChild(nameRow);
    card.appendChild(hpBarWrap);
    card.appendChild(hpText);

    // Click to select target (enemies only for attack, allies for revive/support)
    if (!player.is_dead) {
        card.addEventListener("click", () => selectTargetPlayer(player.id));
    }
    return card;
}

function getAttrIcon(name) {
    const attr = ATTRIBUTES.find(a => a.name === name);
    return attr ? attr.icon : "";
}

function selectTargetPlayer(playerId) {
    selectedTarget = selectedTarget === playerId ? null : playerId;
    // Refresh team display
    document.querySelectorAll(".battle-player-card").forEach(c => {
        c.classList.toggle("selected-target", c.dataset.playerId === selectedTarget);
    });
    // Enable/disable attack button
    const me = gameState?.players?.[myId];
    const target = gameState?.players?.[selectedTarget];
    const attackBtn = document.getElementById("attack-btn");
    attackBtn.disabled = !target || target.team === me?.team || target.is_dead || target.is_downed;
    checkReviveButton();
}

function updateSelfHpBar() {
    const me = gameState?.players?.[myId];
    if (!me) return;
    const pct = Math.max(0, (me.hp / me.max_hp) * 100);
    const bar = document.getElementById("self-hp-bar");
    bar.style.width = pct + "%";
    bar.style.background = pct > 60 ? "var(--hp-bar-green)"
                         : pct > 30 ? "var(--hp-bar-yellow)" : "var(--hp-bar-red)";
    document.getElementById("self-hp-text").textContent =
        `HP: ${Math.max(0, me.hp)} / ${me.max_hp}` +
        (me.shield > 0 ? `  🛡️ ${me.shield}` : "") +
        (me.armor > 0 ? `  ⚔️${me.armor}` : "");
}

function checkReviveButton() {
    const me = gameState?.players?.[myId];
    const btn = document.getElementById("revive-btn");
    if (!me || me.is_dead || me.is_downed) {
        btn.classList.remove("visible");
        return;
    }
    const downedAlly = Object.values(gameState?.players || {}).find(
        p => p.team === me.team && p.id !== myId && p.is_downed
    );
    btn.classList.toggle("visible", !!downedAlly);
}

// ---- Skill Bar ----
function buildSkillBar() {
    const row = document.getElementById("skill-slots-row");
    row.innerHTML = "";
    const slots = myPrivateState?.skill_slots || new Array(SLOT_COUNT).fill(null);
    for (let i = 0; i < SLOT_COUNT; i++) {
        const skill = Array.isArray(slots) ? slots[i] : null;
        const btn = document.createElement("div");
        btn.className = "skill-slot-btn";
        btn.dataset.index = i;
        if (i < 2) btn.classList.add("permanent");
        if (!skill) btn.classList.add("empty");
        const keyDiv = document.createElement("div");
        keyDiv.className = "slot-key";
        keyDiv.textContent = HOTKEYS[i];
        btn.appendChild(keyDiv);
        const nameDiv = document.createElement("div");
        nameDiv.className = "slot-name";
        nameDiv.textContent = skill ? skill.name : "空";
        btn.appendChild(nameDiv);
        if (skill) {
            const lvlDiv = document.createElement("div");
            lvlDiv.className = "slot-lvl";
            lvlDiv.textContent = `Lv${skill.level}`;
            btn.appendChild(lvlDiv);
        }
        if (skill) {
            btn.addEventListener("click", () => onSkillSlotClick(i));
            btn.addEventListener("mouseenter", (e) => showTooltip(skill, e));
            btn.addEventListener("mouseleave", hideTooltip);
        }
        row.appendChild(btn);
    }
}

function updateSkillBarFromSlots(slots) {
    // Rebuild the slot bar with updated slot data
    if (myPrivateState) myPrivateState.skill_slots = slots;
    buildSkillBar();
}

function onSkillSlotClick(index) {
    const me = gameState?.players?.[myId];
    if (!me || me.is_downed || me.is_dead) return;
    wsSend({ action: "use_skill", slotIndex: index, targetId: selectedTarget });
}

function updateSkillCooldownDisplay(slotIndex) {
    // Trigger a brief visual update
    const btn = document.querySelector(`.skill-slot-btn[data-index="${slotIndex}"]`);
    if (!btn) return;
    btn.classList.add("on-cooldown");
}

function updateAllCooldowns() {
    // Re-render cooldown overlays based on server-reported cooldowns from game state
    // Slot cooldowns are in myPrivateState.skill_slots[i].current_cd (remaining seconds)
    const slots = myPrivateState?.skill_slots || [];
    slots.forEach((slot, i) => {
        const btn = document.querySelector(`.skill-slot-btn[data-index="${i}"]`);
        if (!btn || !slot) return;
        const remaining = typeof slot.current_cd === "number" ? slot.current_cd : 0;
        let overlay = btn.querySelector(".cd-overlay");
        if (remaining > 0) {
            btn.classList.add("on-cooldown");
            if (!overlay) {
                overlay = document.createElement("div");
                overlay.className = "cd-overlay";
                btn.appendChild(overlay);
            }
            overlay.textContent = remaining.toFixed(0);
        } else {
            btn.classList.remove("on-cooldown");
            if (overlay) overlay.remove();
        }
    });
}

// ---- Keyboard Shortcuts ----
function onKeyDown(e) {
    const key = e.key;
    const idx = HOTKEYS.indexOf(key);
    if (idx >= 0) {
        onSkillSlotClick(idx);
    }
}

// ---- Event Log ----
function addLogEntry(text, type = "") {
    const panel = document.getElementById("event-log-panel");
    const entry = document.createElement("div");
    entry.className = `event-entry ${type}`;
    entry.textContent = text;
    panel.appendChild(entry);
    panel.scrollTop = panel.scrollHeight;
}

function renderGameLog() {
    // Only called once on init; subsequent entries come from messages
}

// ---- Dropped Skills ----
function renderDroppedSkills(skills) {
    const list = document.getElementById("dropped-skills-list");
    skills.forEach(skill => {
        const el = document.createElement("div");
        el.className = "dropped-skill";
        el.dataset.skillId = skill.id;
        el.textContent = `${skill.name} Lv${skill.level}`;
        el.addEventListener("click", () => {
            wsSend({ action: "pick_up_skill", skillId: skill.id });
        });
        list.appendChild(el);
    });
}

function removeDroppedSkill(skillId) {
    const el = document.querySelector(`.dropped-skill[data-skill-id="${skillId}"]`);
    if (el) el.remove();
}

// ---- Revive ----
function startRevive() {
    const me = gameState?.players?.[myId];
    if (!me) return;
    const downedAlly = Object.values(gameState?.players || {}).find(
        p => p.team === me.team && p.id !== myId && p.is_downed
    );
    if (!downedAlly) return;
    revivingTargetId = downedAlly.id;

    const btn = document.getElementById("revive-btn");
    let progress = 0;
    const step = 200; // ms
    reviveTimer = setInterval(() => {
        progress += step;
        btn.textContent = `💚 救起中 ${Math.floor(progress / 1000)}/${REVIVE_CAST_TIME_MS / 1000}s`;
        if (progress >= REVIVE_CAST_TIME_MS) {
            clearInterval(reviveTimer);
            reviveTimer = null;
            btn.textContent = "💚 救起队友";
            wsSend({ action: "revive_teammate", targetId: revivingTargetId });
            revivingTargetId = null;
        }
    }, step);
}

function cancelRevive() {
    if (reviveTimer) {
        clearInterval(reviveTimer);
        reviveTimer = null;
    }
    revivingTargetId = null;
    document.getElementById("revive-btn").textContent = "💚 救起队友";
}

// ---- Tooltip ----
function showTooltip(skill, event) {
    const tt = document.getElementById("skill-tooltip");
    document.getElementById("tt-name").textContent = skill.name;
    document.getElementById("tt-level").textContent = `等级 ${skill.level} · ${skill.category}`;
    document.getElementById("tt-cd").textContent = `冷却: ${skill.cooldown === 0 ? "被动" : skill.cooldown < 0 ? "?" : skill.cooldown + "s"}`;
    const dmgEl = document.getElementById("tt-dmg");
    if (skill.damage > 0) {
        dmgEl.style.display = "";
        dmgEl.textContent = `伤害: ${skill.damage}`;
    } else {
        dmgEl.style.display = "none";
    }
    document.getElementById("tt-range").textContent = `范围: ${skill.range_desc || "-"}`;
    document.getElementById("tt-desc").textContent = skill.desc || "";
    tt.classList.add("visible");
    positionTooltip(tt, event);
}

function hideTooltip() {
    document.getElementById("skill-tooltip").classList.remove("visible");
}

function positionTooltip(tt, event) {
    const x = Math.min(event.clientX + 10, window.innerWidth - 260);
    const y = Math.min(event.clientY + 10, window.innerHeight - 150);
    tt.style.left = x + "px";
    tt.style.top = y + "px";
}

document.addEventListener("mousemove", e => {
    const tt = document.getElementById("skill-tooltip");
    if (tt.classList.contains("visible")) positionTooltip(tt, e);
});

// ---- Result Screen ----
function showResultScreen(winnerTeam, rewards) {
    clearInterval(battleTimerInterval);
    clearInterval(cdUpdateInterval);
    document.removeEventListener("keydown", onKeyDown);

    const me = gameState?.players?.[myId];
    const myTeam = me?.team;
    const isWin = myTeam === winnerTeam;

    const title = document.getElementById("result-title");
    title.textContent = isWin ? "🏆 胜利！" : "💀 失败";
    title.className = isWin ? "win" : "lose";

    const myReward = rewards?.[myId] || {};
    const rewardsDiv = document.getElementById("result-rewards");
    rewardsDiv.innerHTML = "";
    const coinsP = document.createElement("p");
    coinsP.textContent = `🪙 最终金币: ${Number(myReward.coins) || 0}`;
    const winTeamP = document.createElement("p");
    winTeamP.textContent = `获胜队伍: ${winnerTeam === "A" ? "🔵" : "🔴"} 队伍 ${winnerTeam === "A" ? "A" : "B"}`;
    rewardsDiv.appendChild(coinsP);
    rewardsDiv.appendChild(winTeamP);

    showScreen("result");
}

// ---- Error Display ----
function showError(msg) {
    addLogEntry(`❌ ${msg}`, "death");
    // Flash the error briefly
    const panel = document.getElementById("event-log-panel");
    panel.classList.add("flashing");
    setTimeout(() => panel.classList.remove("flashing"), 400);
}

function getPlayerName(playerId) {
    return gameState?.players?.[playerId]?.name || playerId;
}

// ---- Event Listeners ----
function setupEventListeners() {
    // Draw skill
    document.getElementById("draw-skill-btn").addEventListener("click", () => {
        wsSend({ action: "draw_skill" });
    });

    // Synthesize
    document.getElementById("synthesize-btn").addEventListener("click", () => {
        if (synthSelectedIds.length < 2) {
            showError("请先选择技能进行合成");
            return;
        }
        wsSend({ action: "synthesize_skills", skillIds: synthSelectedIds });
    });

    // Ready
    document.getElementById("ready-btn").addEventListener("click", () => {
        if (!selectedAttribute) {
            showError("请先选择属性");
            return;
        }
        document.getElementById("ready-btn").disabled = true;
        document.getElementById("ready-btn").textContent = "等待其他玩家...";
        wsSend({ action: "player_ready" });
    });

    // Attack
    document.getElementById("attack-btn").addEventListener("click", () => {
        if (!selectedTarget) {
            showError("请先选择攻击目标");
            return;
        }
        const now = Date.now();
        if (now < attackCooldownUntil) {
            showError("攻击冷却中");
            return;
        }
        attackCooldownUntil = now + BASIC_ATTACK_COOLDOWN_MS;
        wsSend({ action: "basic_attack", targetId: selectedTarget });
    });

    // Revive
    document.getElementById("revive-btn").addEventListener("click", () => {
        if (reviveTimer) {
            cancelRevive();
        } else {
            startRevive();
        }
    });
}

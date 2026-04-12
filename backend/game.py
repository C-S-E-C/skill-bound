import asyncio
import random
import time
from uuid import uuid4
from skills_data import SKILLS, SKILL_NAME_LIST, get_skill
from attributes_data import ATTRIBUTES

MAX_HP = 300
SKILL_DRAW_COST = 20
DRAW_PROBABILITIES = [(1, 0.60), (2, 0.30), (3, 0.08), (4, 0.02)]
KILL_REWARD = 100
ASSIST_REWARD = 50
WIN_REWARD = 480  # split evenly among winning team
REVIVE_TIME = 8        # seconds to revive a downed ally
DOWN_TIME_LIMIT = 30   # seconds before downed player dies
SLOT_COUNT = 8
DROPPABLE_SLOTS = 6    # slots 2..7 (index 2-7) are droppable; 0,1 are permanent
BASIC_ATTACK_DAMAGE = 20
BASIC_ATTACK_COOLDOWN = 1.0
CRIT_THRESHOLD = 3     # after 3 consecutive hits, next hit crits (double damage)


def _draw_skill_random():
    """Draw a random skill at a random level using the defined probabilities."""
    level = random.choices(
        [lvl for lvl, _ in DRAW_PROBABILITIES],
        weights=[w for _, w in DRAW_PROBABILITIES],
        k=1
    )[0]
    name = random.choice(SKILL_NAME_LIST)
    skill_data = get_skill(name, level)
    return {
        "id": str(uuid4()),
        "name": name,
        "level": level,
        "category": skill_data["category"],
        "cooldown": skill_data["cooldown"],
        "damage": skill_data["damage"],
        "range_desc": skill_data["range_desc"],
        "effects": skill_data["effects"],
        "desc": skill_data["desc"],
        "current_cd": 0,  # remaining cooldown in seconds
        "permanent": False,  # Whether it persists to next match (via backpack)
    }


class PlayerState:
    def __init__(self, player_id, player_name, team, coins=0):
        self.player_id = player_id
        self.player_name = player_name
        self.team = team
        self.hp = MAX_HP
        self.max_hp = MAX_HP
        self.coins = coins
        self.attribute = None        # chosen attribute name
        self.skill_slots = [None] * SLOT_COUNT  # 8 skill slots
        self.inventory = []          # backpack, max 16 items
        self.status_effects = []     # list of active effects {type, value, expires_at, ...}
        self.is_downed = False
        self.is_dead = False
        self.downed_at = None        # timestamp when downed
        self.ready = False
        self.websocket = None
        self.consecutive_hits = 0    # for crit tracking
        self.last_basic_attack_time = 0
        self.shield = 0              # current shield points
        self.armor = 0               # current armor points
        # Attribute-related state
        self.out_of_combat_timer = None
        self.stealth = False
        self.periodic_armor_timer = None
        self.last_regen_time = None

    def to_dict(self, include_private=False):
        slots = []
        for s in self.skill_slots:
            if s is None:
                slots.append(None)
            else:
                slots.append({
                    "id": s["id"],
                    "name": s["name"],
                    "level": s["level"],
                    "category": s["category"],
                    "cooldown": s["cooldown"],
                    "current_cd": max(0, s["current_cd"] - time.time()) if isinstance(s["current_cd"], float) and s["current_cd"] > 0 else 0,
                    "damage": s["damage"],
                    "range_desc": s["range_desc"],
                    "desc": s["desc"],
                })
        result = {
            "id": self.player_id,
            "name": self.player_name,
            "team": self.team,
            "hp": max(0, self.hp),
            "max_hp": self.max_hp,
            "shield": self.shield,
            "armor": self.armor,
            "attribute": self.attribute,
            "is_downed": self.is_downed,
            "is_dead": self.is_dead,
            "stealth": self.stealth,
            "status_effects": [
                {"type": e["type"], "expires_at": e.get("expires_at", 0)}
                for e in self.status_effects
            ],
            "skill_slots": slots,
            "ready": self.ready,
        }
        if include_private:
            inv = []
            for s in self.inventory:
                inv.append({
                    "id": s["id"],
                    "name": s["name"],
                    "level": s["level"],
                    "category": s["category"],
                    "cooldown": s["cooldown"],
                    "damage": s["damage"],
                    "desc": s["desc"],
                })
            result["inventory"] = inv
            result["coins"] = self.coins
        return result

    def has_effect(self, effect_type):
        now = time.time()
        return any(e["type"] == effect_type and e.get("expires_at", now + 1) > now
                   for e in self.status_effects)

    def apply_effect(self, effect):
        """Add a timed status effect."""
        self.status_effects.append(effect)

    def remove_effect(self, effect_type):
        self.status_effects = [e for e in self.status_effects if e["type"] != effect_type]

    def clean_expired_effects(self):
        now = time.time()
        self.status_effects = [
            e for e in self.status_effects
            if e.get("expires_at", 0) > now or "expires_at" not in e
        ]

    def effective_damage_reduction(self):
        """Return total % damage reduction from effects."""
        total = 0
        now = time.time()
        for e in self.status_effects:
            if e.get("expires_at", now + 1) > now:
                if e["type"] == "dmg_reduction":
                    total += e.get("value", 0)
                elif e["type"] == "passive_dmg_reduction":
                    total += e.get("value", 0)
        return min(total, 80)  # cap at 80%

    def take_damage(self, raw_damage, pierce_armor=False):
        """Apply damage after armor/shield/reduction. Returns actual damage taken."""
        if self.has_effect("invulnerable") or self.has_effect("dodge"):
            return 0
        if self.has_effect("sleeping"):
            # Sleeping: wake up on damage
            self.remove_effect("sleeping")

        damage = raw_damage

        # Armor reduces damage
        if not pierce_armor:
            if self.armor > 0:
                reduction = min(self.armor, damage)
                damage -= reduction

        # % damage reduction
        reduction_pct = self.effective_damage_reduction()
        damage = damage * (1 - reduction_pct / 100.0)
        damage = max(0, damage)

        # Shield absorbs first
        if self.shield > 0:
            absorbed = min(self.shield, damage)
            self.shield -= absorbed
            damage -= absorbed

        self.hp -= damage
        if self.hp <= 0 and not self.is_downed and not self.is_dead:
            self.hp = 0
            self.is_downed = True
            self.downed_at = time.time()

        return raw_damage  # Return raw for logging

    def heal(self, amount):
        """Heal the player. Returns actual amount healed."""
        if self.is_dead:
            return 0
        heal_reduction = 0
        if self.has_effect("heal_reduction"):
            for e in self.status_effects:
                if e["type"] == "heal_reduction" and e.get("expires_at", time.time() + 1) > time.time():
                    heal_reduction += e.get("value", 0)
        effective = amount * (1 - heal_reduction / 100.0)
        overheal = max(0, (self.hp + effective) - self.max_hp)
        self.hp = min(self.max_hp, self.hp + effective)
        return effective, overheal


class GameSession:
    def __init__(self, match_id, mode, battlefield, players_data):
        """
        players_data: list of {player_id, player_name, team, websocket, coins}
        """
        self.match_id = match_id
        self.mode = mode
        self.battlefield = battlefield
        self.players = {}  # player_id -> PlayerState
        self.started = False
        self.ended = False
        self.winner_team = None
        self.game_loop_task = None
        self.start_time = None
        self.event_log = []  # list of log messages

        for pd in players_data:
            p = PlayerState(
                player_id=pd["player_id"],
                player_name=pd["player_name"],
                team=pd["team"],
                coins=pd.get("coins", 0)
            )
            p.websocket = pd["websocket"]
            self.players[pd["player_id"]] = p

    # -----------------------------------------------------------------------
    # Broadcasting helpers
    # -----------------------------------------------------------------------

    async def broadcast(self, message, team=None):
        """Send a JSON message to all (or team-filtered) players."""
        import json
        for p in self.players.values():
            if team and p.team != team:
                continue
            if p.websocket:
                try:
                    await p.websocket.send(json.dumps(message))
                except Exception:
                    pass

    async def send_to(self, player_id, message):
        import json
        p = self.players.get(player_id)
        if p and p.websocket:
            try:
                await p.websocket.send(json.dumps(message))
            except Exception:
                pass

    # -----------------------------------------------------------------------
    # Game state helpers
    # -----------------------------------------------------------------------

    def get_public_state(self):
        return {
            "match_id": self.match_id,
            "mode": self.mode,
            "battlefield": self.battlefield,
            "started": self.started,
            "ended": self.ended,
            "winner_team": self.winner_team,
            "players": {pid: p.to_dict() for pid, p in self.players.items()},
            "event_log": self.event_log[-20:],  # last 20 events
        }

    def add_log(self, msg):
        self.event_log.append({"time": time.time(), "msg": msg})

    def get_enemies_of(self, player_id):
        p = self.players[player_id]
        return [q for q in self.players.values() if q.team != p.team and not q.is_dead]

    def get_allies_of(self, player_id):
        p = self.players[player_id]
        return [q for q in self.players.values() if q.team == p.team and q.player_id != player_id and not q.is_dead]

    def team_alive(self, team):
        return any(not p.is_dead for p in self.players.values() if p.team == team)

    def check_game_over(self):
        teams = set(p.team for p in self.players.values())
        for team in teams:
            if not self.team_alive(team):
                # other teams win
                winners = [t for t in teams if t != team]
                if winners:
                    return winners[0]
        return None

    # -----------------------------------------------------------------------
    # Pre-game actions
    # -----------------------------------------------------------------------

    async def select_attribute(self, player_id, attribute_name):
        p = self.players.get(player_id)
        if not p:
            return {"error": "Player not found"}
        if self.started:
            return {"error": "Game already started"}
        if attribute_name not in ATTRIBUTES:
            return {"error": "Invalid attribute"}
        p.attribute = attribute_name
        attr = ATTRIBUTES[attribute_name]
        # Apply passive attribute effects that take effect immediately
        self._apply_attribute_passives(p, attr)
        await self.broadcast({
            "type": "player_update",
            "player": p.to_dict()
        })
        return {"ok": True}

    def _apply_attribute_passives(self, p, attr):
        for eff in attr.get("effects", []):
            t = eff["type"]
            if t == "cd_reduction":
                # stored on player for cooldown calculations
                p.apply_effect({"type": "cd_reduction_pct", "value": eff["value"]})
            elif t == "dmg_reduction":
                p.apply_effect({"type": "passive_dmg_reduction", "value": eff["value"]})
            elif t == "speed_boost":
                p.apply_effect({"type": "speed_boost", "value": eff["value"]})
            elif t == "skill_range_boost":
                p.apply_effect({"type": "skill_range_boost", "value": eff["value"]})
            # other effects (regen, stealth, etc.) handled in game loop tick

    async def draw_skill(self, player_id):
        p = self.players.get(player_id)
        if not p:
            return {"error": "Player not found"}
        if self.started:
            return {"error": "Game already started"}
        if p.coins < SKILL_DRAW_COST:
            return {"error": f"Not enough coins. Need {SKILL_DRAW_COST}, have {p.coins}"}
        p.coins -= SKILL_DRAW_COST
        skill = _draw_skill_random()
        # Put in inventory if slots are full, else offer to player
        if len(p.inventory) < 16:
            p.inventory.append(skill)
        else:
            return {"error": "Inventory full"}
        await self.send_to(player_id, {
            "type": "skill_drawn",
            "skill": {
                "id": skill["id"],
                "name": skill["name"],
                "level": skill["level"],
                "category": skill["category"],
                "desc": skill["desc"],
                "cooldown": skill["cooldown"],
                "damage": skill["damage"],
            },
            "coins": p.coins,
            "inventory": [{"id": s["id"], "name": s["name"], "level": s["level"],
                           "category": s["category"], "desc": s["desc"]} for s in p.inventory],
        })
        return {"ok": True}

    async def configure_slots(self, player_id, slot_assignments):
        """
        slot_assignments: list of 8 items, each is None or {"source": "inventory", "id": skill_id}
        """
        p = self.players.get(player_id)
        if not p:
            return {"error": "Player not found"}
        if self.started:
            return {"error": "Game already started"}
        if len(slot_assignments) != SLOT_COUNT:
            return {"error": f"Must provide {SLOT_COUNT} slot assignments"}

        # Build new slots
        inv_by_id = {s["id"]: s for s in p.inventory}
        new_slots = []
        used_ids = set()
        for assignment in slot_assignments:
            if assignment is None:
                new_slots.append(None)
            else:
                skill_id = assignment.get("id")
                if skill_id in inv_by_id and skill_id not in used_ids:
                    new_slots.append(inv_by_id[skill_id])
                    used_ids.add(skill_id)
                else:
                    new_slots.append(None)
        p.skill_slots = new_slots
        await self.send_to(player_id, {"type": "slots_configured", "slots": p.to_dict(include_private=True)["skill_slots"]})
        return {"ok": True}

    async def player_ready(self, player_id):
        p = self.players.get(player_id)
        if not p:
            return {"error": "Player not found"}
        if self.started:
            return {"error": "Game already started"}
        p.ready = True
        await self.broadcast({
            "type": "player_ready",
            "player_id": player_id,
            "player_name": p.player_name
        })

        # Check if all players are ready
        if all(pl.ready for pl in self.players.values()):
            await self.start_game()
        return {"ok": True}

    # -----------------------------------------------------------------------
    # Game start
    # -----------------------------------------------------------------------

    async def start_game(self):
        if self.started:
            return
        self.started = True
        self.start_time = time.time()
        self.add_log("战斗开始！")
        await self.broadcast({"type": "game_start", "state": self.get_public_state()})
        self.game_loop_task = asyncio.create_task(self.game_loop())

    async def game_loop(self):
        """Periodic server tick: handle DoTs, regen, downed timers, etc."""
        tick_interval = 1.0  # 1 second ticks
        while not self.ended:
            await asyncio.sleep(tick_interval)
            try:
                await self._tick()
            except Exception as e:
                print(f"Game loop error: {e}")

    async def _tick(self):
        """Process one game tick."""
        now = time.time()
        state_changed = False
        for p in list(self.players.values()):
            if p.is_dead:
                continue
            p.clean_expired_effects()

            # Check if downed player ran out of time
            if p.is_downed and p.downed_at:
                if now - p.downed_at > DOWN_TIME_LIMIT:
                    await self._player_died(p)
                    state_changed = True
                    continue

            if p.is_downed:
                continue

            # Process DoTs (burn, poison, etc.)
            for eff in list(p.status_effects):
                if eff.get("expires_at", 0) <= now:
                    continue
                eff_type = eff["type"]
                if eff_type in ("burn", "poison"):
                    dps = eff.get("dps", 0)
                    pierce = eff_type == "burn" and eff.get("pierce_armor", False)
                    p.take_damage(dps, pierce_armor=pierce)
                    state_changed = True

            # Process attribute regen (圣光, 自然)
            attr = p.attribute
            if attr:
                attr_data = ATTRIBUTES.get(attr, {})
                for eff in attr_data.get("effects", []):
                    if eff["type"] == "regen":
                        heal_amount = abs(eff["dps"])
                        if attr == "圣光" and p.hp < 100:
                            heal_amount = 20
                        p.heal(heal_amount)
                        state_changed = True
                    elif eff["type"] == "periodic_regen":
                        # Every N seconds
                        key = f"_last_periodic_regen_{p.player_id}"
                        last = getattr(p, "_last_periodic_regen", 0)
                        interval = eff.get("interval", 4)
                        if now - last >= interval:
                            p.heal(eff["value"])
                            p._last_periodic_regen = now
                            state_changed = True
                    elif eff["type"] == "periodic_armor":
                        last = getattr(p, "_last_periodic_armor", 0)
                        cd = eff.get("cd", 10)
                        if now - last >= cd and p.armor == 0:
                            p.armor = eff["value"]
                            p._last_periodic_armor = now
                            state_changed = True
                    elif eff["type"] == "out_of_combat_stealth":
                        # Handled separately; simplified here
                        pass

            # Check if HP reached 0 due to DoT
            if p.hp <= 0 and not p.is_downed and not p.is_dead:
                p.hp = 0
                p.is_downed = True
                p.downed_at = now
                state_changed = True
                self.add_log(f"{p.player_name} 倒地！")

        # Check game over
        winner = self.check_game_over()
        if winner:
            await self._end_game(winner)
            return

        if state_changed:
            await self.broadcast({"type": "game_state", "state": self.get_public_state()})

    # -----------------------------------------------------------------------
    # Battle actions
    # -----------------------------------------------------------------------

    async def basic_attack(self, attacker_id, target_id):
        attacker = self.players.get(attacker_id)
        target = self.players.get(target_id)
        if not attacker or not target:
            return {"error": "Invalid players"}
        if not self.started or self.ended:
            return {"error": "Game not in progress"}
        if attacker.is_downed or attacker.is_dead:
            return {"error": "You are downed/dead"}
        if target.is_downed or target.is_dead:
            return {"error": "Target is downed/dead"}
        if attacker.team == target.team:
            return {"error": "Cannot attack ally"}

        # Check basic attack cooldown
        now = time.time()
        if now - attacker.last_basic_attack_time < BASIC_ATTACK_COOLDOWN:
            return {"error": "Attack on cooldown"}
        attacker.last_basic_attack_time = now

        # Calculate damage
        damage = BASIC_ATTACK_DAMAGE

        # Check crit (3 consecutive hits → 4th is crit)
        attacker.consecutive_hits += 1
        is_crit = False
        if attacker.consecutive_hits > CRIT_THRESHOLD:
            damage *= 2
            attacker.consecutive_hits = 0
            is_crit = True

        # Apply attribute on-hit effects
        attr_effects = self._get_attribute_on_hit_effects(attacker)

        # Apply damage
        actual = target.take_damage(damage)

        self.add_log(f"{attacker.player_name} 普通攻击 {target.player_name}，造成 {damage} 点伤害{'（暴击！）' if is_crit else ''}")

        # Apply on-hit attribute effects to target
        for eff in attr_effects:
            if eff["type"] == "on_hit_slow":
                if not target.has_effect("slowed"):
                    target.apply_effect({
                        "type": "slowed",
                        "value": eff["value"],
                        "expires_at": now + eff["duration"]
                    })
            elif eff["type"] == "on_hit_burn":
                target.apply_effect({
                    "type": "burn",
                    "dps": eff["dps"],
                    "pierce_armor": eff.get("pierce_armor", False),
                    "expires_at": now + eff["duration"]
                })
            elif eff["type"] == "on_hit_splash":
                for enemy in self.get_enemies_of(attacker_id):
                    if enemy.player_id != target_id:
                        enemy.take_damage(eff["damage"])

        # Check if target downed/killed
        await self._check_death_state(target, attacker_id, assist_ids=[])

        await self.broadcast({"type": "attack_result", "attacker": attacker_id,
                               "target": target_id, "damage": damage, "is_crit": is_crit,
                               "state": self.get_public_state()})

        winner = self.check_game_over()
        if winner:
            await self._end_game(winner)

        return {"ok": True, "damage": damage, "is_crit": is_crit}

    async def use_skill(self, player_id, slot_index, target_id=None):
        p = self.players.get(player_id)
        if not p:
            return {"error": "Player not found"}
        if not self.started or self.ended:
            return {"error": "Game not in progress"}
        if p.is_downed or p.is_dead:
            return {"error": "You are downed/dead"}
        if p.has_effect("silenced"):
            return {"error": "You are silenced and cannot use skills"}
        if not (0 <= slot_index < SLOT_COUNT):
            return {"error": "Invalid slot index"}

        skill = p.skill_slots[slot_index]
        if skill is None:
            return {"error": "No skill in this slot"}

        now = time.time()

        # Check cooldown (current_cd stores the time when it's ready)
        if isinstance(skill["current_cd"], float) and skill["current_cd"] > now:
            remaining = skill["current_cd"] - now
            return {"error": f"Skill on cooldown ({remaining:.1f}s remaining)"}

        # Set cooldown
        base_cd = skill["cooldown"]
        if base_cd > 0:
            # Apply CD reduction from effects
            cd_reduction = 0
            for e in p.status_effects:
                if e["type"] in ("cd_reduction_pct",) and e.get("expires_at", now + 1) > now:
                    cd_reduction += e.get("value", 0)
            effective_cd = base_cd * (1 - cd_reduction / 100.0)
            skill["current_cd"] = now + max(0, effective_cd)

        # Determine target(s)
        target = None
        if target_id:
            target = self.players.get(target_id)

        # Apply skill effects
        result = await self._apply_skill(p, skill, target, slot_index)

        self.add_log(f"{p.player_name} 使用了 {skill['name']} (Lv{skill['level']})")

        # Check attribute on-skill-hit effects
        if target and target.team != p.team:
            attr_effects = self._get_attribute_on_hit_effects(p)
            for eff in attr_effects:
                if eff["type"] == "on_hit_burn":
                    target.apply_effect({
                        "type": "burn",
                        "dps": eff["dps"],
                        "pierce_armor": eff.get("pierce_armor", False),
                        "expires_at": now + eff["duration"]
                    })
                elif eff["type"] == "on_hit_slow" and not target.has_effect("slowed"):
                    target.apply_effect({
                        "type": "slowed",
                        "value": eff["value"],
                        "expires_at": now + eff["duration"]
                    })

        # Reset consecutive hits for non-crit track on other team
        if target and target.team != p.team and skill.get("damage", 0) > 0:
            p.consecutive_hits = 0

        await self._check_death_state(target, player_id, assist_ids=[])

        await self.broadcast({
            "type": "skill_used",
            "player_id": player_id,
            "slot_index": slot_index,
            "skill_name": skill["name"],
            "skill_level": skill["level"],
            "target_id": target_id,
            "state": self.get_public_state()
        })

        winner = self.check_game_over()
        if winner:
            await self._end_game(winner)

        return {"ok": True, **result}

    async def _apply_skill(self, caster, skill, target, slot_index):
        """Apply skill effects. Returns a summary dict."""
        now = time.time()
        total_damage = 0
        effects_applied = []
        base_damage = skill.get("damage", 0)

        for eff in skill.get("effects", []):
            eff_type = eff["type"]

            # Damage effects
            if eff_type in ("burn", "poison") and target and target.team != caster.team:
                target.apply_effect({
                    "type": eff_type,
                    "dps": eff.get("dps", 0),
                    "pierce_armor": eff.get("pierce_armor", False),
                    "expires_at": now + eff.get("duration", 3)
                })
                effects_applied.append(eff_type)

            elif eff_type == "slow" and target and target.team != caster.team:
                target.apply_effect({
                    "type": "slowed",
                    "value": eff.get("value", 20),
                    "expires_at": now + eff.get("duration", 2)
                })
                effects_applied.append("slow")

            elif eff_type == "freeze" and target and target.team != caster.team:
                target.apply_effect({
                    "type": "frozen",
                    "expires_at": now + eff.get("duration", 1)
                })
                effects_applied.append("freeze")

            elif eff_type == "stun" and target and target.team != caster.team:
                target.apply_effect({
                    "type": "stunned",
                    "expires_at": now + eff.get("duration", 1)
                })
                effects_applied.append("stun")

            elif eff_type == "root" and target and target.team != caster.team:
                target.apply_effect({
                    "type": "rooted",
                    "expires_at": now + eff.get("duration", 2)
                })
                effects_applied.append("root")

            elif eff_type == "silence" and target and target.team != caster.team:
                target.apply_effect({
                    "type": "silenced",
                    "expires_at": now + eff.get("duration", 1)
                })
                effects_applied.append("silence")

            elif eff_type == "fear" and target and target.team != caster.team:
                target.apply_effect({
                    "type": "feared",
                    "expires_at": now + eff.get("duration", 1)
                })
                effects_applied.append("fear")

            elif eff_type == "sleep" and target and target.team != caster.team:
                target.apply_effect({
                    "type": "sleeping",
                    "expires_at": now + eff.get("duration", 2)
                })
                effects_applied.append("sleep")

            elif eff_type == "charm" and target and target.team != caster.team:
                target.apply_effect({
                    "type": "charmed",
                    "expires_at": now + eff.get("duration", 1)
                })
                effects_applied.append("charm")

            # Heal effects (self or ally)
            elif eff_type == "heal":
                heal_target = target if target and target.team == caster.team else caster
                if eff.get("self_target"):
                    heal_target = caster if not target else target
                if heal_target and not heal_target.is_dead:
                    healed, overheal = heal_target.heal(eff.get("value", 0))
                    effects_applied.append(f"heal_{int(healed)}")

            # Shield effects
            elif eff_type == "shield":
                caster.shield += eff.get("value", 0)
                effects_applied.append("shield")

            # Armor effects
            elif eff_type == "armor":
                caster.armor += eff.get("value", 0)
                if eff.get("duration", 999) < 100:
                    caster.apply_effect({
                        "type": "armor_buff",
                        "value": eff.get("value", 0),
                        "expires_at": now + eff.get("duration", 5)
                    })
                effects_applied.append("armor")

            elif eff_type == "self_armor":
                caster.armor += eff.get("value", 0)
                effects_applied.append("self_armor")

            elif eff_type in ("ally_armor",) and target and target.team == caster.team:
                target.armor += eff.get("value", 0)
                effects_applied.append("ally_armor")

            # Speed boost (tracked as effect for frontend display)
            elif eff_type in ("speed_boost", "self_speed_boost"):
                caster.apply_effect({
                    "type": "speed_boost",
                    "value": eff.get("value", 10),
                    "expires_at": now + eff.get("duration", 3)
                })
                effects_applied.append("speed_boost")

            # Stealth
            elif eff_type == "stealth":
                caster.stealth = True
                caster.apply_effect({
                    "type": "stealth",
                    "expires_at": now + eff.get("duration", 5)
                })
                effects_applied.append("stealth")

            # Invulnerable (金身)
            elif eff_type == "invulnerable":
                caster.apply_effect({
                    "type": "invulnerable",
                    "expires_at": now + eff.get("duration", 2)
                })
                effects_applied.append("invulnerable")

            # Dodge (闪避步)
            elif eff_type == "dodge":
                caster.apply_effect({
                    "type": "dodge",
                    "expires_at": now + eff.get("duration", 1)
                })
                effects_applied.append("dodge")

            # Instant revive (复活祷言 lv4)
            elif eff_type == "instant_revive":
                if target and target.team == caster.team and target.is_downed:
                    revive_pct = eff.get("revive_hp_pct", 60) / 100.0
                    target.hp = int(target.max_hp * revive_pct)
                    target.is_downed = False
                    target.downed_at = None
                    effects_applied.append("revive")

            # Cleanse
            elif eff_type in ("cleanse", "cleanse_all"):
                tgt = target if target and target.team == caster.team else caster
                if tgt:
                    neg_effects = ["slowed", "frozen", "stunned", "rooted", "silenced",
                                   "feared", "sleeping", "charmed", "burn", "poison",
                                   "blinded", "heal_reduction"]
                    if eff_type == "cleanse":
                        # remove one
                        for ne in neg_effects:
                            if tgt.has_effect(ne):
                                tgt.remove_effect(ne)
                                break
                    else:
                        for ne in neg_effects:
                            tgt.remove_effect(ne)
                    effects_applied.append("cleanse")

            # Damage reduction (on self)
            elif eff_type == "dmg_reduction":
                caster.apply_effect({
                    "type": "dmg_reduction",
                    "value": eff.get("value", 10),
                    "expires_at": now + eff.get("duration", 3)
                })
                effects_applied.append("dmg_reduction")

            # Damage boost (self)
            elif eff_type in ("ally_dmg_boost",) and target and target.team == caster.team:
                target.apply_effect({
                    "type": "dmg_boost",
                    "value": eff.get("value", 10),
                    "expires_at": now + eff.get("duration", 5)
                })
                effects_applied.append("dmg_boost")

            # Mark (标记)
            elif eff_type in ("mark", "insight_mark") and target and target.team != caster.team:
                target.apply_effect({
                    "type": "marked",
                    "expires_at": now + eff.get("duration", 10)
                })
                effects_applied.append("mark")

            # Blink (逃脱)
            elif eff_type in ("blink_back", "blink_targeted"):
                # Position not tracked server-side in this implementation
                effects_applied.append("blink")

        # Apply base skill damage to target
        if base_damage > 0 and target and target.team != caster.team:
            # Check dmg boost
            dmg_mult = 1.0
            for e in caster.status_effects:
                if e["type"] == "dmg_boost" and e.get("expires_at", now + 1) > now:
                    dmg_mult += e.get("value", 0) / 100.0
            actual_damage = int(base_damage * dmg_mult)
            target.take_damage(actual_damage)
            total_damage += actual_damage

        return {"damage": total_damage, "effects": effects_applied}

    def _get_attribute_on_hit_effects(self, player):
        if not player.attribute:
            return []
        attr = ATTRIBUTES.get(player.attribute, {})
        return [e for e in attr.get("effects", []) if e["type"].startswith("on_hit")]

    async def _check_death_state(self, target, killer_id, assist_ids):
        if not target or target.is_dead:
            return
        if target.hp <= 0 and not target.is_downed:
            target.hp = 0
            target.is_downed = True
            target.downed_at = time.time()
            self.add_log(f"{target.player_name} 倒地！")
            await self.broadcast({"type": "player_downed",
                                   "player_id": target.player_id,
                                   "player_name": target.player_name})

    async def revive_player(self, reviver_id, target_id):
        """Start/continue reviving a downed ally."""
        reviver = self.players.get(reviver_id)
        target = self.players.get(target_id)
        if not reviver or not target:
            return {"error": "Invalid players"}
        if not self.started or self.ended:
            return {"error": "Game not in progress"}
        if reviver.is_downed or reviver.is_dead:
            return {"error": "You are downed/dead"}
        if not target.is_downed or target.is_dead:
            return {"error": "Target is not downed"}
        if reviver.team != target.team:
            return {"error": "Cannot revive enemy"}

        # Simplified: instant revive with 8-second cast tracked client-side
        # Server completes revive on request
        target.hp = int(target.max_hp * 0.30)
        target.is_downed = False
        target.downed_at = None
        self.add_log(f"{reviver.player_name} 救起了 {target.player_name}！")
        await self.broadcast({
            "type": "player_revived",
            "reviver_id": reviver_id,
            "target_id": target_id,
            "state": self.get_public_state()
        })
        return {"ok": True}

    async def pick_up_skill(self, player_id, skill_id, dropped_skills):
        """Player picks up a dropped skill."""
        p = self.players.get(player_id)
        if not p:
            return {"error": "Player not found"}
        if p.is_downed or p.is_dead:
            return {"error": "You are downed/dead"}

        # Find in dropped skills registry
        skill = dropped_skills.get(skill_id)
        if not skill:
            return {"error": "Skill not found"}

        if len(p.inventory) >= 16:
            return {"error": "Inventory full"}
        p.inventory.append(skill)
        del dropped_skills[skill_id]

        await self.send_to(player_id, {
            "type": "skill_picked_up",
            "skill": {"id": skill["id"], "name": skill["name"], "level": skill["level"],
                      "desc": skill["desc"]},
            "inventory": [{"id": s["id"], "name": s["name"], "level": s["level"],
                           "desc": s["desc"]} for s in p.inventory]
        })
        await self.broadcast({"type": "dropped_skill_taken", "skill_id": skill_id})
        return {"ok": True}

    async def synthesize_skills(self, player_id, skill_ids):
        """
        Synthesize skills: 2×lv1 → 1×lv2, 2×lv2 → 1×lv3, 2×lv3 → 1×lv4.
        Note: design doc says 2×lv1→lv2, 4×lv2→lv3, 8×lv3→lv4, but for simplicity
        using pairs (consistent with typical game conventions also implied by the doc
        which says 2 of same level = next level).
        """
        p = self.players.get(player_id)
        if not p:
            return {"error": "Player not found"}

        inv_by_id = {s["id"]: s for s in p.inventory}
        selected = [inv_by_id.get(sid) for sid in skill_ids]
        if any(s is None for s in selected):
            return {"error": "Some skills not found in inventory"}

        # All must be the same name and same level
        if len(set(s["name"] for s in selected)) != 1:
            return {"error": "All skills must be of the same type"}
        if len(set(s["level"] for s in selected)) != 1:
            return {"error": "All skills must be the same level"}

        level = selected[0]["level"]
        name = selected[0]["name"]

        # Required count by level per design doc: 2×lv1→lv2, 4×lv2→lv3, 8×lv3→lv4
        required = {1: 2, 2: 4, 3: 8}
        req = required.get(level)
        if req is None:
            return {"error": "Cannot synthesize level 4 skills"}
        if len(skill_ids) != req:
            return {"error": f"Need {req} skills of level {level} to synthesize"}

        # Check player has all those skills in inventory
        for sid in skill_ids:
            if sid not in inv_by_id:
                return {"error": "Skill not in inventory"}

        # Remove old skills
        p.inventory = [s for s in p.inventory if s["id"] not in set(skill_ids)]

        # Create new skill at level+1
        new_level = level + 1
        skill_data = get_skill(name, new_level)
        if not skill_data:
            return {"error": f"No level {new_level} data for {name}"}

        new_skill = {
            "id": str(uuid4()),
            "name": name,
            "level": new_level,
            "category": skill_data["category"],
            "cooldown": skill_data["cooldown"],
            "damage": skill_data["damage"],
            "range_desc": skill_data["range_desc"],
            "effects": skill_data["effects"],
            "desc": skill_data["desc"],
            "current_cd": 0,
        }
        p.inventory.append(new_skill)
        self.add_log(f"{p.player_name} 合成了 {name} Lv{new_level}！")

        await self.send_to(player_id, {
            "type": "synthesis_result",
            "new_skill": {"id": new_skill["id"], "name": new_skill["name"],
                          "level": new_skill["level"], "desc": new_skill["desc"]},
            "inventory": [{"id": s["id"], "name": s["name"], "level": s["level"],
                           "desc": s["desc"]} for s in p.inventory]
        })
        return {"ok": True, "new_skill": new_skill}

    # -----------------------------------------------------------------------
    # Player death and skill drops
    # -----------------------------------------------------------------------

    async def _player_died(self, player):
        """Called when a downed player's timer expires."""
        player.is_dead = True
        player.is_downed = False

        # Drop skills from droppable slots (slots 2-7)
        dropped = {}
        for i in range(2, SLOT_COUNT):
            skill = player.skill_slots[i]
            if skill:
                dropped[skill["id"]] = skill
                player.skill_slots[i] = None

        self.add_log(f"{player.player_name} 已死亡，掉落 {len(dropped)} 个技能！")

        await self.broadcast({
            "type": "player_died",
            "player_id": player.player_id,
            "player_name": player.player_name,
            "dropped_skills": [
                {"id": s["id"], "name": s["name"], "level": s["level"], "desc": s["desc"]}
                for s in dropped.values()
            ],
            "state": self.get_public_state()
        })
        return dropped

    # -----------------------------------------------------------------------
    # Game end
    # -----------------------------------------------------------------------

    async def _end_game(self, winner_team):
        if self.ended:
            return
        self.ended = True
        self.winner_team = winner_team

        # Distribute win coins
        winners = [p for p in self.players.values() if p.team == winner_team]
        if winners:
            per_player = WIN_REWARD // len(winners)
            for w in winners:
                w.coins += per_player

        self.add_log(f"队伍 {winner_team} 获胜！")

        await self.broadcast({
            "type": "game_over",
            "winner_team": winner_team,
            "rewards": {
                pid: {"coins": p.coins} for pid, p in self.players.items()
            },
            "state": self.get_public_state()
        })

        if self.game_loop_task:
            self.game_loop_task.cancel()

# Skill Bound Gameplay

English | [简体中文](玩法-zh_hans.md)

## 1. Core Rules

### 1.1 Basic Setup

* **Player health**: 500 HP
* **Base movement speed**: 200
* **Downed state**: When health reaches zero, the player is downed. Teammates can revive the player within 30 seconds. If no revive happens, the player dies and drops every skill in droppable skill slots.
* **Revive**: Stand within 1 meter of a downed teammate for 8 seconds. The reviving player cannot attack or move during the revive.
* **Critical hits**: After hitting an enemy three consecutive times, the fourth attack becomes a critical hit and deals double damage.
* **Skill slots**: 8 total slots. 2 slots are non-droppable and permanently retained. 6 slots are droppable and lose their skills on death.
* **Backpack**: 16 slots for skills that can be brought out of a match after winning.
* **Skill levels**: Level 1 is the weakest and Level 4 is the strongest.
* **Skill synthesis**: 2 Level 1 skills create 1 Level 2 skill; 4 Level 2 skills create 1 Level 3 skill; 8 Level 3 skills create 1 Level 4 skill.
* **Coin system**:
  * Kill: +100 coins
  * Assist: +50 coins
  * Winning team: splits 480 coins
* **Pre-match draw**: Spend 20 coins to draw a random skill. Odds: Level 1 60%, Level 2 30%, Level 3 8%, Level 4 2%.
* **Match mode**: Rooms support squads of 1, 2, 3, or 4 players, with 12 players total.

## 2. Block Properties

| Block | ID | Property |
|-|-|-|
| Wall | B | Blocks players and attacks |
| Water | W | Blocks players; attacks can pass through |
| Bush | G | A player inside a bush is invisible to players outside the bush |

## 3. Attribute System

| Attribute | ID | Icon | Core Trait | Passive Bonus |
|-|-|-|-|-|
| Fire | fire | Fire | Burst damage suppression | Skill hits apply burn: 20 damage per second for 4 seconds. Burn ignores armor. |
| Ice | ice | Ice | Reliable slows | Attacks and skill hits slow the target by 30% for 2 seconds. |
| Lightning | lightning | Lightning | Reliable splash | Attacks and skill hits deal 40 splash damage to enemies within 5 meters of the target. |
| Wind | wind | Wind | Mobility | Movement speed +30%; skill cooldowns -15%. |
| Water | water | Water | Damage reduction and cleanse | Damage taken -15%; removes one negative effect every 12 seconds. |
| Shadow | shadow | Shadow | Stealth ambush | Enter stealth after leaving combat. The first hit breaks stealth and deals 50 bonus damage. |
| Beacon | beacon | Beacon | Sustain | Regenerates 15 HP per second below 400 HP, or 30 HP per second below 150 HP. |
| Rock | rock | Rock | Defense | Gains 150 armor every 8 seconds, not stackable. Damage over 40 is reduced by 12. |
| Sand | sand | Sand | Slow traps | Skill hits leave a sand area on the ground with a 4-meter radius for 4 seconds. Enemies inside are slowed by 50%. |
| Forest | forest | Forest | Healing | Regenerates 50 HP every 6 seconds, or every 3 seconds out of combat. |
| Time | time | Time | Cooldown reduction | All skill cooldowns -25%; attack projectile speed +25%. |
| Space | space | Space | Damage-triggered blink | All skill ranges +25%; after taking damage, dash 4 meters in the joystick direction. |
| Soul | soul | Soul | Resource vision | Skill hits make enemies follow your joystick movement for 2 seconds. Vision range +25%. |
| Poison | poison | Poison | Damage over time | Attacked targets take 15 damage per second until the negative effect is cleansed. Healing received -30%. |
| Gold | gold | Gold | Hardened heavy hits | Skill hits grant 10 armor for 4 seconds, stackable. Kills grant 80 extra coins. |

### 3.1 Offensive Skills

| Attribute | Skill | ID | Cooldown | Range | Shape | Speed | Lv1 | Lv2 | Lv3 | Lv4 |
|-|-|-|-|-|-|-|-|-|-|-|
| Fire | Flame Fireball | fireball | 8s | 22m x 3m line, 3m explosion radius | Line | Fast | 50 damage + burn 2s (10/s) | 80 damage + burn 2.5s (15/s) | 120 damage + burn 3s (20/s) | 160 damage + burn 4s (25/s), center +30 |
| Ice | Ice Spike | ice_spike | 7s | 26m x 2m line, pierces | Line | Fast | 45 damage + slow 30% | 75 damage + slow 40%, pierces 1 | 110 damage + slow 50%, pierces 2 | 150 damage + freeze 0.5s, pierces 3 |
| Lightning | Thunder Shock | lightning_shock | 9s | 20m single target, 6m bounce radius | Bounce | Instant | 60 damage, 1 bounce (40) | 90 damage, 2 bounces (60/40) | 130 damage, 3 bounces (80/60/40) | 180 damage, 4 bounces (100/80/60/40) |
| Wind | Wind Slash | wind_slash | 5s | 20m x 90 degree cone | Cone | Very fast | 3 slashes x 20 damage | 3 slashes x 30 damage | 4 slashes x 35 damage | 4 slashes x 50 damage, +30% move speed for 2s after casting |
| Water | High-Pressure Cannon | water_cannon | 8s | 24m x 2.5m line | Line | Medium | 45 damage + knockback 4m | 75 damage + knockback 5m | 110 damage + knockback 6m | 150 damage + knockback 8m |
| Shadow | Shadow Assault | shadow_assault | 10s | 16m blink, target required | Blink | Blink | 60 damage | 90 damage + stealth 1s | 130 damage + stealth 2s | 180 damage + stealth 3s |
| Beacon | Beacon Blast | beacon_blast | 6s | 22m x 2m line | Line | Very fast | 45 damage | 75 damage, +50% vs low-health targets | 110 damage, +75% vs low-health targets | 150 damage, double vs low-health targets |
| Rock | Earth Shatter | rock_shatter | 9s | 16m x 3m line | Line | Medium | 50 damage + knock-up 0.5s | 80 damage + knock-up 0.8s | 120 damage + knock-up 1s | 170 damage + knock-up 1.2s |
| Sand | Sand Blast | sand_blast | 8s | 20m circle, 3m radius | Circle | Slow | 40 damage + sand 2s (slow 30%) | 65 damage + sand 2.5s (slow 40%) | 100 damage + sand 3s (slow 50%) | 140 damage + sand 4s (slow 60%) |
| Forest | Thorn Shot | forest_spike | 6s | 22m x 2m line, pierces | Line | Fast | 35 damage, pierces 1 | 60 damage, pierces 2 | 90 damage, pierces 3 | 130 damage, pierces all |
| Time | Temporal Cut | time_cut | 10s | 20m x 90 degree cone | Cone | Instant | 40 damage + 2s mark, detonates for 20% | 65 damage + 2.5s mark, detonates for 25% | 100 damage + 3s mark, detonates for 30% | 140 damage + 3.5s mark, detonates for 35% |
| Space | Void Bounce | space_bounce | 8s | 22m bounce, 7m bounce radius | Bounce | Fast | 50 damage, 2 bounces | 80 damage, 3 bounces | 120 damage, 4 bounces | 170 damage, 5 bounces |
| Soul | Soul Arrow | soul_arrow | 9s | 22m x 1.5m line | Line | Fast | 40 damage + pull toward self 1s | 65 damage + pull 1.2s | 100 damage + pull 1.5s | 140 damage + pull 2s |
| Poison | Poison Nova | poison_nova | 6s | 6m radius around self | Circular aura | Instant | 25 damage + poison 4s (10/s) | 50 damage + poison 5s (12/s) | 80 damage + poison 6s (15/s) | 120 damage + poison 7s (20/s) |
| Gold | Golden Hammer | gold_hammer | 8s | Forward 6m x 90 degree cone | Cone | Medium | 45 damage + self +5 armor 3s | 75 damage + self +8 armor | 110 damage + self +12 armor | 155 damage + self +15 armor |

### 3.2 Defensive Skills

| Attribute | Skill | ID | Cooldown | Range | Shape | Activation | Lv1 | Lv2 | Lv3 | Lv4 |
|-|-|-|-|-|-|-|-|-|-|-|
| Fire | Flame Armor | fire_armor | 14s | Self | Self | Instant | 15 armor 4s, reflect 12 | 25 armor 5s, reflect 20 | 40 armor 6s, reflect 30 | 60 armor 7s, reflect 45 |
| Ice | Ice Armor | ice_armor | 13s | Self | Self | Instant | 15 armor 4s, attacker slowed 25% | 25 armor 4.5s, slow 30% | 40 armor 5s, slow 40% | 60 armor 6s, slow 50% |
| Lightning | Lightning Armor | lightning_armor | 15s | Self | Self | Instant | 12 armor 3s, hit reflection 15 splash | 20 armor 3.5s, reflect 25 | 35 armor 4s, reflect 40 | 50 armor 5s, reflect 60 |
| Wind | Wind Wall | wind_wall | 12s | 5m wide x 4m high in front | Wall | Place | Blocks projectiles 2s | Blocks 2.5s + allied projectiles +20% speed | Blocks 3s + allies +20% move speed | Blocks 4s + self cooldown -15% |
| Water | Water Shield | water_shield | 14s | Self | Self | Instant | Absorbs 50 damage for 4s | Absorbs 85 for 4.5s | Absorbs 130 for 5s | Absorbs 180 for 6s |
| Shadow | Shadow Cloak | shadow_cloak | 16s | Self | Self | Instant | Stealth 2s + 15% damage reduction | Stealth 2.5s + 20% reduction | Stealth 3s + 25% reduction | Stealth 4s + 35% reduction |
| Beacon | Beacon Shield | beacon_shield | 15s | Self | Self | Instant | Absorbs 50 damage for 3s | Absorbs 85 for 3.5s | Absorbs 130 for 4s | Absorbs 180 for 5s + control immunity |
| Rock | Rock Skin | rock_skin | 16s | Self | Self | Instant | 25 armor 3s | 40 armor 3.5s | 60 armor 4s | 85 armor 5s + control immunity |
| Sand | Sand Armor | sand_armor | 14s | Self | Self | Instant | 12 armor 4s, leaves sand on hit for 2s | 20 armor 4.5s, sand 2.5s | 35 armor 5s, sand 3s | 50 armor 6s, sand 4s |
| Forest | Tree of Life | forest_tree | 15s | 6m radius around self | Circle placement | Place | Tree 4s, nearby heal 8/s | Tree 5s, heal 12/s | Tree 6s, heal 18/s | Tree 7s, heal 25/s |
| Time | Time Rewind | time_rewind | 20s | Self | Self | Instant | Rewind lethal damage within 1.5s | Rewind within 2s | Rewind within 2.5s + heal 25 | Rewind within 3s + heal 50 |
| Space | Spatial Warp | space_blink | 18s | Up to 20m | Blink | Blink | Return to marked point after 2s | Return + 15% damage reduction | Return + 20% reduction | Return + 25% reduction + 60 area damage |
| Soul | Soul Link | soul_link | 20s | Link teammate within 20m | Link | Instant | Share 25% damage for 6s | Share 30% for 7s + heal 5/s | Share 35% for 8s + heal 8/s | Share 45% for 10s + heal 12/s |
| Poison | Poison Armor | poison_armor | 15s | Self | Self | Instant | 12 armor 4s, reflect 15% | 20 armor 4.5s, reflect 20% + poison | 35 armor 5s, reflect 25% | 50 armor 6s, reflect 30% + strong poison |
| Gold | Golden Body | gold_body | 16s | 5m radius around self | Circular aura | Instant | 15 armor 4s + nearby slow aura 20% | 25 armor 5s + slow 25% | 40 armor 6s + slow 30% | 60 armor 7s + slow 40% aura |

### 3.3 Support Skills

These skills must hit teammates.

| Attribute | Skill | ID | Cooldown | Range | Shape | Speed | Lv1 | Lv2 | Lv3 | Lv4 |
|-|-|-|-|-|-|-|-|-|-|-|
| Fire | Battle Cry | fire_battle_cry | 14s | 8m radius around self | Circular aura | Instant | Nearby allies +10% attack 4s | +15% attack 4.5s | +20% attack 5s | +30% attack 6s |
| Ice | Ice Mantle | ice_mantle | 13s | 22m x 2m line | Line | Fast | Hit ally: +12 armor 4s | +20 armor 4.5s | +30 armor 5s | +45 armor 6s |
| Lightning | Energy Charge | lightning_charge | 16s | 20m single target | Target lock | Instant | Hit ally: cooldown -10% for 4s | Cooldown -15% for 5s | Cooldown -20% for 5s | Cooldown -25% for 6s + restore 20% mana |
| Wind | Wind Blessing | wind_blessing | 12s | 22m x 90 degree cone | Cone | Very fast | Allies in cone +20% move speed 4s | +25% for 4.5s | +30% for 5s | +40% for 6s |
| Water | Healing Water | water_heal | 14s | 20m single target | Target lock | Fast | Hit ally: heal 60 HP | Heal 90 | Heal 130 | Heal 180 |
| Shadow | Shadow Stealth | shadow_stealth | 18s | 20m x 2m line | Line | Fast | Hit ally: stealth 3s | Stealth 4s | Stealth 5s | Stealth 6s |
| Beacon | Beacon Heal | beacon_heal | 15s | 20m circle, 4m radius | Circle placement | Place | Allies in area heal 70 + 30 shield | Heal 100 + 50 shield | Heal 140 + 80 shield | Heal 200 + 120 shield |
| Rock | Rock Mantle | rock_mantle | 15s | 18m single target | Target lock | Medium | Hit ally: +18 armor 4s | +30 armor 4.5s | +45 armor 5s | +65 armor 6s |
| Sand | Sand Blessing | sand_blessing | 16s | 22m x 2m line | Line | Fast | Hit ally: leaves sand on hit for 2s (slow 30%) | Sand 2.5s (slow 40%) | Sand 3s (slow 50%) | Sand 4s (slow 60%) |
| Forest | Rejuvenation | forest_rejuvenate | 16s | 20m single target | Target lock | Fast | Hit ally: heal 8/s for 5s | Heal 12/s for 6s | Heal 18/s for 7s | Heal 25/s for 8s |
| Time | Time Blessing | time_blessing | 20s | 20m x 90 degree cone | Cone | Very fast | Allies in cone cooldown -12% for 4s | -18% for 5s | -25% for 5s | -30% for 6s |
| Space | Space Blessing | space_blessing | 18s | 18m single target | Target lock | Very fast | Hit ally: range +15% for 6s | +20% for 7s | +25% for 8s | +30% for 10s |
| Soul | Soul Pact | soul_pact | 17s | 22m x 2m line | Line | Fast | Hit ally: ally damage heals you for 15% | 18% healing + 15% shared damage | 22% healing + 20% shared damage | 25% healing + 25% shared damage |
| Poison | Poisoned Blade | poison_blade | 12s | 20m single target | Target lock | Fast | Hit ally: attacks apply poison 8/s for 3s | Poison 12/s for 3.5s | Poison 15/s for 4s | Poison 25/s for 5s |
| Gold | Gold Blessing | gold_blessing | 18s | 6m radius around self | Circular aura | Instant | Nearby allies +8 armor 4s | +12 armor 5s | +18 armor 6s | +25 armor 7s |

### 3.4 Control Skills

| Attribute | Skill | ID | Cooldown | Range | Shape | Speed | Core Mechanic | Lv1 | Lv2 | Lv3 | Lv4 |
|-|-|-|-|-|-|-|-|-|-|-|-|
| Fire | Flame Cage | fire_cage | 14s | Place within 16m, 4.5m radius | Circle placement | Medium | Trap + burning | Trap 2s, 12 damage/s | Trap 2.5s, 15/s | Trap 3s, 20/s | Trap 3.5s, 30/s |
| Ice | Ice Nova | ice_nova | 12s | 6m radius around self | Circular aura | Instant | Freeze + damage | 25 damage + freeze 0.8s | 40 damage + freeze 1s | 60 damage + freeze 1.2s | 90 damage + freeze 1.5s |
| Lightning | Lightning Grid | lightning_grid | 13s | Place within 17m, 5m radius | Circle placement | Instant | Slow + damage over time | 3s, 8 damage every 0.5s | 3.5s, 12 every 0.5s | 4s, 15 every 0.5s | 5s, 20 every 0.5s |
| Wind | Wind Tornado | wind_tornado | 11s | Place within 16m, 4.5m radius | Circle placement | Medium | Pull + knock-up | Pull + knock-up 0.4s | Knock-up 0.5s | Knock-up 0.6s | Knock-up 0.8s |
| Water | Water Prison | water_prison | 14s | 22m x 2m line | Line | Fast | Root + drowning damage | Root 1.5s, 5 damage/s | Root 1.8s, 8/s | Root 2.2s, 10/s | Root 2.5s, 15/s |
| Shadow | Shadow Chain | shadow_chain | 13s | 24m x 2m line | Line | Very fast | Root + silence | Root 1.2s + silence 0.8s | Root 1.5s + silence 1s | Root 1.8s + silence 1.2s | Root 2.2s + silence 1.5s |
| Beacon | Beacon Imprison | beacon_imprison | 15s | 20m single target | Target lock | Very fast | Stun | Stun 1s | Stun 1.2s | Stun 1.5s | Stun 1.8s |
| Rock | Rock Gaze | rock_gaze | 16s | Forward 12m x 90 degree cone | Cone | Medium | Petrify + damage reduction protection | Petrify 0.8s, damage reduction 20% | Petrify 1s, reduction 25% | Petrify 1.2s, reduction 30% | Petrify 1.5s, reduction 30% |
| Sand | Sand Trap | sand_trap | 14s | Place within 16m, 4m radius | Circle placement | Slow | Slow + pull to center | Slow 30%, pull to center 3s | Slow 40%, pull 3.5s | Slow 50%, pull 4s | Slow 60%, pull 5s |
| Forest | Vine Bind | forest_vine | 12s | 24m x 2m line | Line | Fast | Root + nature damage | Root 1.5s, 5 damage/s | Root 1.8s, 8/s | Root 2.2s, 10/s | Root 2.5s, 15/s |
| Time | Time Stop | time_stop | 20s | Place within 18m, 5.5m radius | Circle placement | Instant | Full stasis in area | Cannot act for 1.5s | 1.8s | 2.2s | 2.5s |
| Space | Void Imprison | space_void | 17s | 20m single target | Target lock | Very fast | Banish + damage on return | Banish 1s, 20 damage on return | 1.2s, 30 damage | 1.5s, 45 damage | 1.8s, 70 damage |
| Soul | Soul Fear | soul_fear | 15s | 22m x 90 degree cone | Cone | Fast | Fear + vulnerability | Fear 1s, vulnerable 5% | Fear 1.2s, vulnerable 8% | Fear 1.5s, vulnerable 12% | Fear 1.8s, vulnerable 15% |
| Poison | Poison Miasma | poison_miasma | 13s | Place within 17m, 5.5m radius | Circle placement | Slow | Poison fog + periodic silence | 4s, 8 damage/s, no silence | 4.5s, 12/s, silence 0.5s every 3s | 5s, 15/s, silence 0.8s every 3s | 6s, 20/s, silence 1s every 3s |
| Gold | Golden Taunt | gold_taunt | 18s | 6m radius around self | Circular aura | Instant | Taunt + self armor | Nearby enemies forced to attack you 1s, self +10 armor | 1.2s, self +15 armor | 1.5s, self +20 armor | 1.8s, self +30 armor |

### 3.5 Utility Skills

| Attribute | Skill | ID | Cooldown | Range | Shape | Speed | Core Mechanic | Lv1 | Lv2 | Lv3 | Lv4 |
|-|-|-|-|-|-|-|-|-|-|-|-|
| Fire | Flame Mark | fire_mark | 18s | 40m x 2m line | Line | Very fast | Mark + damage amp | Mark 8s, your damage to target +10% | 10s, +12% | 12s, +15% | 15s, +20% and team +8% |
| Ice | Ice Path | ice_path | 20s | Self, 2m-wide ice trail behind | Self trail | Instant | Slowing ice trail | Ice trail 5s, enemies slowed 25% | 6s, slow 30% | 7s, slow 40% | 8s, slow 50% |
| Lightning | Lightning Pull | lightning_pull | 16s | 26m x 2m line | Line | Very fast | Pull enemies | Pull 6m | Pull 7m | Pull 8m | Pull 10m |
| Wind | Wind Dash | wind_dash | 14s | Self | Self | Instant | Speed boost | +35% move speed 2s | +40% for 2.5s | +50% for 3s | +60% for 3.5s |
| Water | Water Mirror | water_mirror | 22s | Self | Self | Instant | Creates a mirror image | Mirror has 20% HP for 5s | 25% HP for 6s | 30% HP for 7s | 40% HP for 8s |
| Shadow | Shadow Blink | shadow_blink | 16s | 22m blink | Blink | Blink | Blink + stealth | Blink + stealth 1.5s | Stealth 2s | Stealth 2.5s | Stealth 3s |
| Beacon | Beacon Eye | beacon_eye | 18s | Whole map | Whole map | Instant | Reveal enemies | Reveal enemies within 30m for 3s | 40m for 4s | Whole map 4s | Whole map 5s |
| Rock | Rock Wall | rock_wall | 20s | Place within 22m, wall 7m long x 1m wide | Wall placement | Medium | Block movement/projectiles | Wall 3s, 120 HP | 3.5s, 180 HP | 4s, 250 HP | 5s, 350 HP |
| Sand | Sand Path | sand_path | 18s | Self, 3m-wide sand trail behind | Self trail | Instant | Slowing sand trail | Sand trail 3s, enemies slowed 35% | 4s, slow 45% | 5s, slow 55% | 6s, slow 65% |
| Forest | Nature Eye | forest_eye | 22s | Place within 28m, 10m radius | Circle placement | Medium | Scouting | Eye 30s | 45s + invisible | 60s + mark | 90s + mark |
| Time | Time Slow | time_slow | 24s | 24m x 2m line | Line | Very fast | Slow actions | Target actions -25% for 3s | -30% for 3.5s | -35% for 4s | -45% for 5s |
| Space | Space Swap | space_swap | 18s | Ally within 18m | Target lock | Blink | Swap positions + speed boost | Swap + 12% move speed 1.5s | +15% for 2s | +20% for 2.5s | +25% for 3s |
| Soul | Soul Vision | soul_vision | 20s | 35m radius around self | Circular aura | Instant | Vision + mark | Reveal enemies within 25m for 4s | 30m for 5s | 35m for 6s | 40m for 8s |
| Poison | Poison Trap | poison_trap | 16s | Place within 16m, 3.5m trigger radius | Circle placement | Medium | Trap + poison | Trigger: 20 damage + poison 3s (8/s) | 30 damage + poison 4s (10/s) | 45 damage + poison 5s (12/s) | 70 damage + poison 6s (15/s) |
| Gold | Gold Mark | gold_mark | 20s | 40m x 2m line | Line | Very fast | Mark + team coins | Mark target; if killed, team +25 coins | Team +35 coins | Team +50 coins | Team +80 coins |

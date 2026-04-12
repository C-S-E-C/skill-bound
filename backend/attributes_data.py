# All 12 attributes from 主要玩法.md
# Each attribute: {name, icon_emoji, description, passive_effects}

ATTRIBUTES = {
    "烈火": {
        "name": "烈火",
        "icon": "🔥",
        "desc": "持续伤害压制",
        "passive_desc": "技能命中后附加燃烧：每秒造成15点伤害，持续4秒。每次命中刷新持续时间。燃烧伤害无视护甲。",
        "effects": [
            {"type": "on_hit_burn", "dps": 15, "duration": 4, "pierce_armor": True}
        ]
    },
    "寒冰": {
        "name": "寒冰",
        "icon": "❄️",
        "desc": "稳定减速",
        "passive_desc": "攻击和技能命中后必定使目标减速25%，持续2秒。减速效果不可叠加。",
        "effects": [
            {"type": "on_hit_slow", "value": 25, "duration": 2, "no_stack": True}
        ]
    },
    "雷电": {
        "name": "雷电",
        "icon": "⚡",
        "desc": "稳定溅射",
        "passive_desc": "攻击和技能命中后，对目标周围5米内的敌人造成30点溅射伤害。",
        "effects": [
            {"type": "on_hit_splash", "damage": 30, "radius": 5}
        ]
    },
    "疾风": {
        "name": "疾风",
        "icon": "💨",
        "desc": "机动性",
        "passive_desc": "移动速度提升25%。技能冷却减少10%。",
        "effects": [
            {"type": "speed_boost", "value": 25},
            {"type": "cd_reduction", "value": 10}
        ]
    },
    "清水": {
        "name": "清水",
        "icon": "💧",
        "desc": "减伤免控",
        "passive_desc": "受到的伤害减去10%，每20秒可以清除一个负面效果。",
        "effects": [
            {"type": "dmg_reduction", "value": 10},
            {"type": "auto_cleanse", "cd": 20}
        ]
    },
    "暗影": {
        "name": "暗影",
        "icon": "🌑",
        "desc": "隐身突袭",
        "passive_desc": "脱离战斗5秒后进入隐身状态，第一次攻击或技能命中后隐身解除，并造成额外30点伤害。",
        "effects": [
            {"type": "out_of_combat_stealth", "delay": 5},
            {"type": "stealth_break_bonus", "value": 30}
        ]
    },
    "圣光": {
        "name": "圣光",
        "icon": "✨",
        "desc": "生存续航",
        "passive_desc": "每秒回复10点生命。当生命值低于100时，回复效果提升至每秒20点。",
        "effects": [
            {"type": "regen", "dps": -10},
            {"type": "low_hp_regen", "dps": -20, "threshold": 100}
        ]
    },
    "大地": {
        "name": "大地",
        "icon": "🪨",
        "desc": "防御减伤",
        "passive_desc": "每10秒获得100点护甲，不可叠加。受到攻击时，若伤害超过30点，则减免8点。",
        "effects": [
            {"type": "periodic_armor", "value": 100, "cd": 10},
            {"type": "large_hit_reduction", "threshold": 30, "reduction": 8}
        ]
    },
    "自然": {
        "name": "自然",
        "icon": "🌿",
        "desc": "生命恢复",
        "passive_desc": "每4秒回复40点生命。脱战后每2秒回复40点。",
        "effects": [
            {"type": "periodic_regen", "value": 40, "interval": 4},
            {"type": "oot_regen", "value": 40, "interval": 2}
        ]
    },
    "时空": {
        "name": "时空",
        "icon": "⏳",
        "desc": "冷却缩减",
        "passive_desc": "所有技能冷却时间减少20%，攻击飞行速度增加20%。",
        "effects": [
            {"type": "cd_reduction", "value": 20},
            {"type": "projectile_speed", "value": 20}
        ]
    },
    "空间": {
        "name": "空间",
        "icon": "🌀",
        "desc": "受伤闪现",
        "passive_desc": "所有技能范围增加20%，受到攻击后，向摇杆方向位移三米。",
        "effects": [
            {"type": "skill_range_boost", "value": 20},
            {"type": "on_hit_blink", "distance": 3}
        ]
    },
    "灵魂": {
        "name": "灵魂",
        "icon": "👁️",
        "desc": "资源视野",
        "passive_desc": "技能命中敌人，使敌人跟随自己的摇杆移动1.5秒。视野范围扩大20%。",
        "effects": [
            {"type": "on_skill_hit_control", "duration": 1.5},
            {"type": "vision_boost", "value": 20}
        ]
    },
}

ATTRIBUTE_NAMES = list(ATTRIBUTES.keys())

def get_attribute(name):
    """Return attribute data by name."""
    return ATTRIBUTES.get(name)

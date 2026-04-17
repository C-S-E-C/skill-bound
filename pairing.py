import asyncio
import random
from uuid import uuid4

# {group_id: {mode, battlefield, users: [{team, websocket, id, name}]}}
PENDING_PAIRING = {}


def _new_group(data, websocket):
    """Create a new pairing group and add the first player."""
    group_id = str(uuid4())
    team = random.choice(["A", "B"])
    user = {
        "team": team,
        "websocket": websocket,
        "id": 0,
        "name": data.get("userId", "Unknown"),
    }
    PENDING_PAIRING[group_id] = {
        "mode": int(data["mode"]),
        "battlefield": data["battlefield"],
        "users": [user],
    }
    return group_id, user


async def start_pairing(data, websocket):
    mode = int(data["mode"])
    battlefield = data["battlefield"]
    user_name = data.get("userId", "Unknown")

    joinable_group_id = None
    for gid, group in PENDING_PAIRING.items():
        if group["mode"] == mode and group["battlefield"] == battlefield:
            users = group["users"]
            team_a = sum(1 for u in users if u["team"] == "A")
            team_b = sum(1 for u in users if u["team"] == "B")
            total_needed = mode * 2
            if len(users) < total_needed:
                joinable_group_id = gid
                break

    if joinable_group_id:
        group = PENDING_PAIRING[joinable_group_id]
        users = group["users"]
        team_a = sum(1 for u in users if u["team"] == "A")
        team_b = sum(1 for u in users if u["team"] == "B")

        if team_a < mode:
            team = "A"
        elif team_b < mode:
            team = "B"
        else:
            team = random.choice(["A", "B"])

        new_user = {
            "team": team,
            "websocket": websocket,
            "id": len(users),
            "name": user_name,
        }
        users.append(new_user)

        group_id = joinable_group_id
        my_id = new_user["id"]
        my_team = new_user["team"]
    else:
        group_id, new_user = _new_group(data, websocket)
        group = PENDING_PAIRING[group_id]
        users = group["users"]
        my_id = new_user["id"]
        my_team = new_user["team"]

    # Notify this player of their group/team
    await websocket.send_json_safe({
        "type": "paired",
        "groupId": group_id,
        "sessionId": group_id,
        "myId": my_id,
        "myTeam": my_team,
        "battlefield": battlefield,
    })

    # Send all existing players (including self) to the new player
    for player in users:
        await new_user["websocket"].send_json_safe({
            "type": "add_player",
            "playerName": player["name"],
            "playerTeam": player["team"],
        })

    # Notify existing players (all except the new one) about the new arrival
    for recipient in users:
        if recipient["id"] != new_user["id"]:
            await recipient["websocket"].send_json_safe({
                "type": "add_player",
                "playerName": new_user["name"],
                "playerTeam": new_user["team"],
            })

    # Check if group is full
    total_needed = mode * 2
    if len(users) >= total_needed:
        match_id = str(uuid4())
        # Notify all players that pairing is complete
        players_data = [
            {
                "player_id": u["name"],
                "player_name": u["name"],
                "team": u["team"],
                "websocket": u["websocket"],
            }
            for u in users
        ]
        for u in users:
            await u["websocket"].send_json_safe({
                "type": "pairing_complete",
                "matchId": match_id,
                "sessionId": match_id,
                "battlefield": battlefield,
                "players": [
                    {"id": p["name"], "name": p["name"], "team": p["team"]}
                    for p in users
                ],
            })

        # Remove from pending
        del PENDING_PAIRING[group_id]
        return match_id, players_data

    return None, None


def remove_from_pairing(user_name):
    """Remove a user from any pending pairing group. Clean up empty groups."""
    for gid in list(PENDING_PAIRING.keys()):
        group = PENDING_PAIRING[gid]
        group["users"] = [u for u in group["users"] if u["name"] != user_name]
        if not group["users"]:
            del PENDING_PAIRING[gid]

import asyncio
import json
import pathlib
from websockets.asyncio.server import serve
import websockets.exceptions
import pairing
from game import GameSession
import ssl

# Active game sessions: {match_id: GameSession}
GAME_SESSIONS = {}
# Dropped skills per match: {match_id: {skill_id: skill_data}}
DROPPED_SKILLS = {}
# Player → match mapping: {player_id: match_id}
PLAYER_MATCH = {}
# Player → websocket mapping: {player_id: websocket}
PLAYER_SOCKETS = {}


class _JsonWebSocket:
    """Thin wrapper that adds send_json_safe to a websocket."""
    def __init__(self, ws):
        self._ws = ws

    async def send_json_safe(self, data):
        try:
            await self._ws.send(json.dumps(data))
        except Exception:
            pass

    async def send(self, data):
        await self._ws.send(data)

    def __getattr__(self, name):
        return getattr(self._ws, name)


async def handler(websocket):
    wrapped = _JsonWebSocket(websocket)
    player_id = None
    try:
        async for raw_msg in websocket:
            try:
                data = json.loads(raw_msg)
            except json.JSONDecodeError:
                await wrapped.send_json_safe({"error": "Invalid JSON"})
                continue

            action = data.get("action")
            if not action:
                await wrapped.send_json_safe({"error": "Missing action"})
                continue

            # ---- Ping ----
            if action == "ping":
                await wrapped.send_json_safe({"response": "pong"})

            # ---- Matchmaking ----
            elif action == "start_pairing":
                pid = data.get("userId", "unknown")
                player_id = pid
                PLAYER_SOCKETS[pid] = wrapped

                match_id, players_data = await pairing.start_pairing(data, wrapped)
                if match_id and players_data:
                    # Assign websockets by player_id index
                    for pd in players_data:
                        sock = PLAYER_SOCKETS.get(pd["player_name"])
                        if sock:
                            pd["websocket"] = sock
                        else:
                            pd["websocket"] = wrapped

                    session = GameSession(
                        match_id=match_id,
                        mode=int(data["mode"]),
                        battlefield=data["battlefield"],
                        players_data=players_data,
                    )
                    GAME_SESSIONS[match_id] = session
                    DROPPED_SKILLS[match_id] = {}
                    for pd in players_data:
                        PLAYER_MATCH[pd["player_id"]] = match_id

            # ---- Pre-game: join existing match (after reconnect/redirect) ----
            elif action == "join_match":
                match_id = data.get("matchId")
                pid = data.get("userId")
                player_id = pid
                PLAYER_SOCKETS[pid] = wrapped

                session = GAME_SESSIONS.get(match_id)
                if not session:
                    await wrapped.send_json_safe({"error": "Match not found"})
                    continue

                # Update websocket for this player in session
                p = session.players.get(pid)
                if p:
                    p.websocket = wrapped
                    PLAYER_MATCH[pid] = match_id
                    await wrapped.send_json_safe({
                        "type": "match_joined",
                        "state": session.get_public_state(),
                        "private": p.to_dict(include_private=True),
                    })
                else:
                    await wrapped.send_json_safe({"error": "You are not in this match"})

            # ---- Pre-game: select attribute ----
            elif action == "select_attribute":
                match_id = _get_match(data, player_id)
                session = GAME_SESSIONS.get(match_id)
                if not session:
                    await wrapped.send_json_safe({"error": "Match not found"})
                    continue
                pid = data.get("userId", player_id)
                result = await session.select_attribute(pid, data.get("attribute"))
                await wrapped.send_json_safe({"type": "action_result", "action": action, **result})

            # ---- Pre-game: draw skill ----
            elif action == "draw_skill":
                match_id = _get_match(data, player_id)
                session = GAME_SESSIONS.get(match_id)
                if not session:
                    await wrapped.send_json_safe({"error": "Match not found"})
                    continue
                pid = data.get("userId", player_id)
                result = await session.draw_skill(pid)
                if "error" in result:
                    await wrapped.send_json_safe({"type": "error", "message": result["error"]})

            # ---- Pre-game: configure skill slots ----
            elif action == "configure_slots":
                match_id = _get_match(data, player_id)
                session = GAME_SESSIONS.get(match_id)
                if not session:
                    await wrapped.send_json_safe({"error": "Match not found"})
                    continue
                pid = data.get("userId", player_id)
                result = await session.configure_slots(pid, data.get("slots", []))
                await wrapped.send_json_safe({"type": "action_result", "action": action, **result})

            # ---- Pre-game: player ready ----
            elif action == "player_ready":
                match_id = _get_match(data, player_id)
                session = GAME_SESSIONS.get(match_id)
                if not session:
                    await wrapped.send_json_safe({"error": "Match not found"})
                    continue
                pid = data.get("userId", player_id)
                result = await session.player_ready(pid)
                await wrapped.send_json_safe({"type": "action_result", "action": action, **result})

            # ---- Battle: basic attack ----
            elif action == "basic_attack":
                match_id = _get_match(data, player_id)
                session = GAME_SESSIONS.get(match_id)
                if not session:
                    await wrapped.send_json_safe({"error": "Match not found"})
                    continue
                pid = data.get("userId", player_id)
                result = await session.basic_attack(pid, data.get("targetId"))
                if "error" in result:
                    await wrapped.send_json_safe({"type": "error", "message": result["error"]})

            # ---- Battle: use skill ----
            elif action == "use_skill":
                match_id = _get_match(data, player_id)
                session = GAME_SESSIONS.get(match_id)
                if not session:
                    await wrapped.send_json_safe({"error": "Match not found"})
                    continue
                pid = data.get("userId", player_id)
                result = await session.use_skill(
                    pid,
                    int(data.get("slotIndex", 0)),
                    data.get("targetId")
                )
                if "error" in result:
                    await wrapped.send_json_safe({"type": "error", "message": result["error"]})

            # ---- Battle: revive teammate ----
            elif action == "revive_teammate":
                match_id = _get_match(data, player_id)
                session = GAME_SESSIONS.get(match_id)
                if not session:
                    await wrapped.send_json_safe({"error": "Match not found"})
                    continue
                pid = data.get("userId", player_id)
                result = await session.revive_player(pid, data.get("targetId"))
                if "error" in result:
                    await wrapped.send_json_safe({"type": "error", "message": result["error"]})

            # ---- Battle: pick up dropped skill ----
            elif action == "pick_up_skill":
                match_id = _get_match(data, player_id)
                session = GAME_SESSIONS.get(match_id)
                if not session:
                    await wrapped.send_json_safe({"error": "Match not found"})
                    continue
                pid = data.get("userId", player_id)
                dropped = DROPPED_SKILLS.get(match_id, {})
                result = await session.pick_up_skill(pid, data.get("skillId"), dropped)
                if "error" in result:
                    await wrapped.send_json_safe({"type": "error", "message": result["error"]})

            # ---- Battle: synthesize skills ----
            elif action == "synthesize_skills":
                match_id = _get_match(data, player_id)
                session = GAME_SESSIONS.get(match_id)
                if not session:
                    await wrapped.send_json_safe({"error": "Match not found"})
                    continue
                pid = data.get("userId", player_id)
                result = await session.synthesize_skills(pid, data.get("skillIds", []))
                if "error" in result:
                    await wrapped.send_json_safe({"type": "error", "message": result["error"]})

            # ---- Unknown action ----
            else:
                await wrapped.send_json_safe({"error": f"Unknown action: {action}"})

    except websockets.exceptions.ConnectionClosedOK:
        pass
    except websockets.exceptions.ConnectionClosedError:
        pass
    except Exception as e:
        print(f"Handler error: {e}")
    finally:
        if player_id:
            PLAYER_SOCKETS.pop(player_id, None)


def _get_match(data, player_id):
    """Extract match_id from data or look it up by player_id."""
    mid = data.get("matchId")
    if mid:
        return mid
    return PLAYER_MATCH.get(player_id)


async def main():
    # Try to use SSL if cert exists, otherwise plain WS
    cert_path = pathlib.Path(__file__).with_name("cert.pem")
    ssl_ctx = None
    if cert_path.exists():
        ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_ctx.load_cert_chain(cert_path)

    host = "0.0.0.0"
    port = 8765
    print(f"Starting WebSocket server on ws{'s' if ssl_ctx else ''}://{host}:{port}")
    async with serve(handler, host, port, ssl=ssl_ctx) as server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())

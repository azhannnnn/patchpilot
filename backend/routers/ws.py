"""WebSocket router — real-time agent trace streaming"""
import asyncio, json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.incident_service import get_incident

router = APIRouter()

# incident_id → set of WebSocket connections
_connections: dict = {}

async def broadcast(incident_id: str, payload: dict):
    if incident_id not in _connections:
        return
    dead = set()
    for ws in _connections[incident_id]:
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            dead.add(ws)
    _connections[incident_id] -= dead

@router.websocket("/ws/{incident_id}")
async def websocket_endpoint(websocket: WebSocket, incident_id: str):
    await websocket.accept()
    _connections.setdefault(incident_id, set()).add(websocket)
    try:
        # Send current state immediately on connect
        inc = get_incident(incident_id)
        if inc:
            await websocket.send_text(json.dumps({"event": "snapshot", "data": inc}))
        # Poll for updates and push them
        last_step_count = len((inc or {}).get("agent_trace", []))
        while True:
            await asyncio.sleep(1.5)
            inc = get_incident(incident_id)
            if not inc:
                continue
            new_steps = inc.get("agent_trace", [])
            if len(new_steps) != last_step_count:
                last_step_count = len(new_steps)
                await websocket.send_text(json.dumps({
                    "event": "trace_update",
                    "data":  {"agent_trace": new_steps, "status": inc.get("status"), "gemini_active": inc.get("gemini_active", False)}
                }))
            if inc.get("status") in ("resolved","auto_resolved","rejected","closed"):
                await websocket.send_text(json.dumps({"event": "completed", "data": inc}))
                break
    except WebSocketDisconnect:
        pass
    finally:
        if incident_id in _connections:
            _connections[incident_id].discard(websocket)

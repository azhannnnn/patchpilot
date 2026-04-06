"""Agent inspection endpoints"""
from fastapi import APIRouter, HTTPException
from services.incident_service import get_incident
from tools.mcp_tools import TOOL_SCHEMAS
from memory.memory_agent import memory_agent

router = APIRouter()

@router.get("/{incident_id}/trace")
async def get_agent_trace(incident_id: str):
    inc = get_incident(incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    trace = inc.get("agent_trace", [])
    return {
        "incident_id":     incident_id,
        "status":          inc.get("status"),
        "agent_trace":     trace,
        "plan":            inc.get("plan", []),
        "memory_hits":     inc.get("memory_hits", []),
        "is_repeat_issue": inc.get("is_repeat_issue", False),
        "fingerprint":     inc.get("fingerprint", ""),
        "gemini_active":   inc.get("gemini_active", False),
        "tool_calls_made": sum(len(s.get("tool_calls",[])) for s in trace),
        "debate_happened": any(s.get("agent") == "DebateAgent" for s in trace),
        "tasks_scheduled": len(inc.get("scheduled_tasks", [])),
    }

@router.get("/tools/schema")
async def get_tool_schemas():
    return {"tools": TOOL_SCHEMAS, "count": len(TOOL_SCHEMAS), "protocol": "MCP JSON-RPC 2.0"}

@router.get("/memory/stats")
async def memory_stats():
    return memory_agent.stats()

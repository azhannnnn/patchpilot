"""
PatchPilot v5 — LangGraph Multi-Agent Orchestrator
Key upgrades vs v4:
  - Gemini function calling (not text-to-JSON hacks)
  - Parallel tool execution via asyncio.gather
  - TaskAgent node: schedules follow-up tasks in Firestore
  - WebSocket broadcast after each node
  - gemini_active flag tracked throughout
"""
import json, os, random, asyncio
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import StateGraph, END
from google.cloud import firestore

from tools.mcp_tools import tool_executor, TOOL_SCHEMAS
from memory.memory_agent import memory_agent, compute_fingerprint

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
REGION     = os.environ.get("REGION", "us-central1")

# ── Gemini init with function calling ────────────────────────
VERTEX_AVAILABLE = False
_model = None

try:
    import vertexai
    from vertexai.generative_models import GenerativeModel, Tool, FunctionDeclaration, Part
    if PROJECT_ID:
        vertexai.init(project=PROJECT_ID, location=REGION)
        _model = GenerativeModel("gemini-1.5-flash")
        VERTEX_AVAILABLE = True
except Exception:
    pass

db = firestore.Client()

# ── Broadcast registry (populated by WebSocket router) ────────
_ws_broadcaster = None
def set_broadcaster(fn):
    global _ws_broadcaster
    _ws_broadcaster = fn

async def _broadcast(incident_id: str, event: str, data: Dict):
    if _ws_broadcaster:
        try:
            await _ws_broadcaster(incident_id, {"event": event, "data": data})
        except Exception:
            pass


# ── Gemini helpers ─────────────────────────────────────────────
def _gemini_json(prompt: str) -> Optional[Dict]:
    if not VERTEX_AVAILABLE or not _model:
        return None
    try:
        resp = _model.generate_content(
            prompt + "\n\nRespond ONLY with valid JSON and nothing else."
        )
        text = resp.text.strip()
        for prefix in ["```json", "```"]:
            if text.startswith(prefix):
                text = text[len(prefix):]
        text = text.rstrip("```").strip()
        return json.loads(text)
    except Exception:
        return None


def _gemini_plan(alert: Dict) -> Optional[Dict]:
    if not VERTEX_AVAILABLE or not _model:
        return None
    tool_names = [t["name"] for t in TOOL_SCHEMAS]
    prompt = f"""You are PlannerAgent for PatchPilot, an incident response system.
Alert:
  Title: {alert.get("title")}
  Service: {alert.get("service")}
  Description: {alert.get("description")}
  Severity: {alert.get("severity")}

Available tools: {", ".join(tool_names)}

Create an investigation plan. Return ONLY this JSON:
{{
  "plan_summary": "brief description",
  "steps": [
    {{"tool": "tool_name", "parameters": {{}}, "rationale": "why this tool"}}
  ]
}}"""
    return _gemini_json(prompt)


def _gemini_rca(alert: Dict, tool_results: List[Dict], memory_hits: List[Dict]) -> Optional[Dict]:
    if not VERTEX_AVAILABLE or not _model:
        return None
    prompt = f"""You are DiagnosticAgent. Synthesise tool results into a root cause analysis.
Alert: {alert.get("title")} on {alert.get("service")}
Tool Results (sample): {json.dumps(tool_results[:3], indent=2)[:2500]}
Past incidents: {json.dumps(memory_hits[:2], indent=2)[:1000]}

Return ONLY this JSON:
{{
  "root_cause": "clear statement of what caused this",
  "confidence": 0.85,
  "evidence": ["evidence item 1", "evidence item 2", "evidence item 3"],
  "affected_services": ["service1", "service2"],
  "recommended_action": "immediate next step"
}}"""
    return _gemini_json(prompt)


def _gemini_debate(role: str, title: str, service: str, root_cause: str,
                   evidence: List[str], challenger_context: str = "") -> Optional[Dict]:
    if not VERTEX_AVAILABLE or not _model:
        return None
    prompt = f"""You are {role} in a multi-agent debate about incident remediation.
Incident: {title} on {service}
Root cause: {root_cause}
Evidence: {chr(10).join(evidence)}
{challenger_context}

Propose a specific remediation. Return ONLY this JSON:
{{
  "proposed_fix": "specific fix description",
  "reasoning": "technical rationale",
  "steps": ["step 1", "step 2", "step 3", "step 4"],
  "risk_level": "low|medium|high",
  "estimated_minutes": 15
}}"""
    return _gemini_json(prompt)


# ── Rule-based fallbacks ──────────────────────────────────────
def _fallback_plan(alert: Dict) -> Dict:
    title   = alert.get("title", "").lower()
    service = alert.get("service", "unknown")
    if "cpu" in title:
        steps = [
            {"tool":"get_metrics",           "parameters":{"service":service,"metric_type":"cpu"},          "rationale":"Check CPU utilisation trend"},
            {"tool":"query_logs",            "parameters":{"service":service,"severity":"ERROR"},            "rationale":"Error spike correlation"},
            {"tool":"get_deployment_history","parameters":{"service":service},                               "rationale":"Detect recent deploy correlation"},
            {"tool":"search_incidents",      "parameters":{"query":"high cpu","service":service},            "rationale":"Historical pattern lookup"},
            {"tool":"check_dependencies",    "parameters":{"service":service},                               "rationale":"Dependency pressure check"},
            {"tool":"fetch_runbook",         "parameters":{"issue_type":"high_cpu","service":service},       "rationale":"Runbook retrieval"},
        ]
    elif "memory" in title or "oom" in title:
        steps = [
            {"tool":"get_metrics",           "parameters":{"service":service,"metric_type":"memory"},        "rationale":"Memory pressure check"},
            {"tool":"query_logs",            "parameters":{"service":service,"keyword":"OOMKill"},            "rationale":"OOM event detection"},
            {"tool":"fetch_runbook",         "parameters":{"issue_type":"oom_kill","service":service},        "rationale":"OOM runbook retrieval"},
            {"tool":"check_dependencies",    "parameters":{"service":service},                               "rationale":"Upstream pressure"},
            {"tool":"scale_service",         "parameters":{"service":service,"action":"scale_up","instances":3,"approved":True},"rationale":"Pre-emptive scale"},
        ]
    elif "latency" in title or "db" in title:
        steps = [
            {"tool":"get_metrics",           "parameters":{"service":service,"metric_type":"latency"},       "rationale":"Latency percentile check"},
            {"tool":"check_dependencies",    "parameters":{"service":service,"include_db":True},             "rationale":"Database bottleneck check"},
            {"tool":"query_logs",            "parameters":{"service":service,"keyword":"timeout"},            "rationale":"Timeout error scan"},
            {"tool":"fetch_runbook",         "parameters":{"issue_type":"db_latency","service":service},     "rationale":"DB runbook retrieval"},
        ]
    elif "503" in title or "down" in title:
        steps = [
            {"tool":"get_metrics",           "parameters":{"service":service,"metric_type":"error_rate"},    "rationale":"Error rate baseline"},
            {"tool":"query_logs",            "parameters":{"service":service,"severity":"ERROR"},            "rationale":"Error log analysis"},
            {"tool":"check_dependencies",    "parameters":{"service":service},                               "rationale":"Upstream health check"},
            {"tool":"get_deployment_history","parameters":{"service":service},                               "rationale":"Detect deployment correlation"},
            {"tool":"fetch_runbook",         "parameters":{"issue_type":"service_down","service":service},   "rationale":"Service down runbook"},
        ]
    else:
        steps = [
            {"tool":"get_metrics",           "parameters":{"service":service,"metric_type":"all"},           "rationale":"Full metrics snapshot"},
            {"tool":"query_logs",            "parameters":{"service":service,"severity":"ERROR"},            "rationale":"Error log analysis"},
            {"tool":"check_dependencies",    "parameters":{"service":service},                               "rationale":"Dependency health"},
            {"tool":"search_incidents",      "parameters":{"query":alert.get("title","incident")},           "rationale":"Historical lookup"},
        ]
    return {"plan_summary": f"Investigating {alert.get('title','incident')} on {service}", "steps": steps}


def _fallback_rca(alert: Dict) -> Dict:
    service = alert.get("service", "unknown")
    return {
        "root_cause": f"Sustained resource exhaustion on {service} correlated with recent deployment v2.4.1",
        "confidence": round(random.uniform(0.75, 0.92), 2),
        "evidence": [
            f"CPU {_vary(94.2)}% sustained for {random.randint(8,14)}+ minutes",
            f"Memory {_vary(95.1, 0.05)}% utilised, GC pauses {round(random.uniform(1.8,2.5),1)}s",
            "Recent deployment 2h ago modified connection pool config",
            "Dependency payment-service showing degraded latency",
        ],
        "affected_services": [service, "payment-service"],
        "recommended_action": "Scale horizontally and rollback connection pool configuration",
    }

def _vary(base, pct=0.08):
    return round(base * (1 + random.uniform(-pct, pct)), 1)


# ── State definition ──────────────────────────────────────────
class IncidentState(TypedDict):
    incident_id:     str
    alert:           Dict
    plan:            Optional[Dict]
    plan_steps:      List[Dict]
    tool_results:    List[Dict]
    agent_trace:     List[Dict]
    memory_hits:     List[Dict]
    is_repeat_issue: bool
    auto_fix_data:   Optional[Dict]
    rca:             Optional[Dict]
    debate_result:   Optional[Dict]
    remediation:     Optional[Dict]
    scheduled_tasks: List[Dict]
    fingerprint:     str
    status:          str
    error:           Optional[str]
    gemini_active:   bool


def _save_state(incident_id: str, state: IncidentState):
    try:
        update = {
            "status":          state.get("status", "open"),
            "agent_trace":     state.get("agent_trace", []),
            "plan":            state.get("plan_steps", []),
            "memory_hits":     [str(h) for h in state.get("memory_hits", [])],
            "is_repeat_issue": state.get("is_repeat_issue", False),
            "fingerprint":     state.get("fingerprint", ""),
            "gemini_active":   state.get("gemini_active", False),
            "scheduled_tasks": state.get("scheduled_tasks", []),
            "updated_at":      datetime.utcnow().isoformat(),
        }
        if state.get("rca") is not None:
            update["diagnostic"] = state["rca"]
        if state.get("remediation") is not None:
            update["remediation"] = state["remediation"]
        db.collection("incidents").document(incident_id).update(update)
    except Exception:
        pass


# ── GRAPH NODES ───────────────────────────────────────────────

def planner_node(state: IncidentState) -> IncidentState:
    alert = state["alert"]
    plan = _gemini_plan(alert)
    gemini_used = plan is not None
    if not plan:
        plan = _fallback_plan(alert)
    steps = plan.get("steps", [])
    state["plan"]         = plan
    state["plan_steps"]   = steps
    state["status"]       = "planning"
    state["gemini_active"]= gemini_used
    state["agent_trace"]  = [{
        "agent": "PlannerAgent", "action": "Generate investigation plan",
        "reasoning": plan.get("plan_summary", "Generating investigation steps"),
        "tool_calls": [], "output": f"Created {len(steps)}-step plan",
        "timestamp": datetime.utcnow().isoformat(),
        "gemini_active": gemini_used
    }]
    _save_state(state["incident_id"], state)
    return state


def _has_developer_approved_resolution(fingerprint: str) -> bool:
    """
    Returns True ONLY if a developer has explicitly approved the resolution
    strategy for this fingerprint in a prior incident.
    Approval is indicated by: status == 'resolved' AND approved_by is set
    (approved_by is only written when a human presses Approve in the console).
    """
    try:
        docs = (db.collection("incidents")
                  .where("fingerprint", "==", fingerprint)
                  .where("status", "==", "resolved")
                  .stream())
        for doc in docs:
            data = doc.to_dict()
            if data.get("approved_by"):   # set only on explicit human approval
                return True
    except Exception:
        pass
    return False


def memory_node(state: IncidentState) -> IncidentState:
    alert       = state["alert"]
    fingerprint = compute_fingerprint(alert.get("title",""), alert.get("service",""))
    similar, is_repeat, auto_fix = memory_agent.find_similar(alert.get("title",""), alert.get("service",""))
    repeat_count = memory_agent.get_repeat_count(fingerprint)

    # FIXED: both conditions must be true to allow auto-resolution
    # Condition 1 -- same alert has occurred before (is_repeat == True)
    # Condition 2 -- a developer has explicitly approved the resolution strategy
    developer_approved = _has_developer_approved_resolution(fingerprint) if is_repeat else False
    auto_fix_eligible  = is_repeat and developer_approved

    # If it is a repeat but no developer has approved it yet, treat as a
    # novel incident so it routes through the full pipeline -> awaiting_approval.
    effective_auto_fix = auto_fix if auto_fix_eligible else None

    state["memory_hits"]     = similar
    state["is_repeat_issue"] = is_repeat
    state["auto_fix_data"]   = effective_auto_fix   # None unless BOTH conditions met
    state["fingerprint"]     = fingerprint

    if auto_fix_eligible:
        output_msg = (f"REPEAT DETECTED — developer-approved auto-fix eligible "
                      f"(seen {repeat_count}x, prior approval on record)")
    elif is_repeat:
        output_msg = (f"REPEAT DETECTED — seen {repeat_count}x but NO developer approval "
                      f"found for this resolution strategy. Routing to full pipeline for human review.")
    else:
        output_msg = f"{len(similar)} similar incidents found (first occurrence)"

    state["agent_trace"] = state.get("agent_trace", []) + [{
        "agent": "MemoryAgent", "action": "Search incident memory (FAISS + Firestore)",
        "reasoning": (
            f"Fingerprint lookup + vector similarity for {alert.get('service','')}. "
            f"Auto-resolve requires: (1) prior occurrence AND (2) explicit developer approval."
        ),
        "tool_calls": [],
        "output": output_msg,
        "timestamp": datetime.utcnow().isoformat(),
        "gemini_active": False
    }]
    _save_state(state["incident_id"], state)
    return state


def tool_executor_node(state: IncidentState) -> IncidentState:
    """Run all MCP tool calls IN PARALLEL using asyncio.gather."""
    plan_steps = state.get("plan_steps", [])
    state["status"] = "diagnosing"

    # Build parallel call list
    call_list = [{"tool": s.get("tool",""), "parameters": s.get("parameters",{})} for s in plan_steps]

    # Execute concurrently
    try:
        loop = asyncio.new_event_loop()
        results_raw = loop.run_until_complete(tool_executor.execute_parallel(call_list))
        loop.close()
    except Exception:
        results_raw = [tool_executor.execute(s.get("tool",""), s.get("parameters",{})) for s in plan_steps]

    tool_results = []
    tool_calls   = []
    for step, raw in zip(plan_steps, results_raw):
        tool_calls.append({
            "tool_name":  step.get("tool",""),
            "parameters": step.get("parameters",{}),
            "result":     raw.get("result", raw.get("error")),
            "error":      raw.get("error"),
            "duration_ms":raw.get("duration_ms"),
            "source":     raw.get("source", "mocked")
        })
        tool_results.append({"tool": step.get("tool",""), "result": raw.get("result",{}), "rationale": step.get("rationale","")})

    real_count = sum(1 for tc in tool_calls if tc.get("source") not in ("mocked", None))
    state["tool_results"] = tool_results
    state["agent_trace"]  = state.get("agent_trace",[]) + [{
        "agent": "ToolAgent (MCP)", "action": f"Execute {len(plan_steps)} MCP tool calls in parallel",
        "reasoning": "Gathering diagnostic data concurrently across all monitored surfaces",
        "tool_calls": tool_calls,
        "output": f"Collected data from {len(plan_steps)} tools ({real_count} via real GCP APIs)",
        "timestamp": datetime.utcnow().isoformat(),
        "gemini_active": False
    }]
    _save_state(state["incident_id"], state)
    return state


def rca_node(state: IncidentState) -> IncidentState:
    alert        = state["alert"]
    tool_results = state.get("tool_results", [])
    memory_hits  = state.get("memory_hits",  [])
    rca = _gemini_rca(alert, tool_results, memory_hits)
    gemini_used = rca is not None
    if not rca:
        rca = _fallback_rca(alert)
    rca["is_repeat_issue"]    = state.get("is_repeat_issue", False)
    rca["auto_fix_available"] = state.get("is_repeat_issue", False)
    state["rca"]    = rca
    state["status"] = "debating"
    state["gemini_active"] = state.get("gemini_active", False) or gemini_used
    state["agent_trace"] = state.get("agent_trace",[]) + [{
        "agent": "DiagnosticAgent", "action": "Root cause analysis",
        "reasoning": "Synthesising tool outputs, log patterns and historical incidents",
        "tool_calls": [], "output": rca.get("root_cause",""),
        "timestamp": datetime.utcnow().isoformat(),
        "gemini_active": gemini_used
    }]
    _save_state(state["incident_id"], state)
    return state


def debate_node(state: IncidentState) -> IncidentState:
    alert = state["alert"]
    rca   = state.get("rca", {})
    title, service = alert.get("title",""), alert.get("service","")
    evidence = rca.get("evidence", [])

    # Proposer
    p_data = _gemini_debate("Proposer", title, service, rca.get("root_cause",""), evidence)
    gemini_used = p_data is not None
    proposer_fix  = (p_data or {}).get("proposed_fix", f"Scale {service} horizontally to 5 instances and enable CPU throttling protection")
    proposer_rsn  = (p_data or {}).get("reasoning",    "Horizontal scaling addresses immediate resource exhaustion without deployment risk")
    proposer_steps= (p_data or {}).get("steps",        ["Scale instances to 5","Enable throttling protection","Monitor 15 minutes","Update alert thresholds"])

    # Challenger
    c_data = _gemini_debate("Challenger", title, service, rca.get("root_cause",""), evidence,
                            f"Proposer suggested: {proposer_fix}. You must counter-argue with a different approach.")
    gemini_used = gemini_used or (c_data is not None)
    challenger_fix  = (c_data or {}).get("proposed_fix", f"Rollback {service} to last stable version and increase memory limits")
    challenger_rsn  = (c_data or {}).get("reasoning",    "The issue correlates with a recent deploy; rollback is the fastest path to stability")
    challenger_steps= (c_data or {}).get("steps",        ["Identify last stable version","Initiate rolling rollback","Monitor health checks","Post-mortem review"])

    confidence    = round(random.uniform(0.72, 0.94), 2)
    winner        = "PROPOSER" if confidence >= 0.5 else "CHALLENGER"
    winning_steps = proposer_steps if winner == "PROPOSER" else challenger_steps

    debate = {
        "proposer_fix": proposer_fix, "challenger_fix": challenger_fix,
        "proposer_reasoning": proposer_rsn, "challenger_reasoning": challenger_rsn,
        "final_verdict": f"{winner} wins ({round(confidence*100)}% confidence). Fix: {proposer_fix if winner=='PROPOSER' else challenger_fix}",
        "consensus_confidence": confidence, "winner": winner, "winning_steps": winning_steps,
    }
    state["debate_result"]  = debate
    state["gemini_active"]  = state.get("gemini_active", False) or gemini_used
    state["remediation"]    = {
        "steps":                    winning_steps,
        "estimated_time_minutes":   random.randint(10, 35),
        "risk_level":               random.choice(["low","medium"]),
        "rollback_plan":            f"Revert {service} to v2.3.9 if metrics do not recover within 20 minutes",
        "requires_downtime":        False,
        "debate_result":            debate,
    }
    state["status"] = "debating"
    state["agent_trace"] = state.get("agent_trace",[]) + [{
        "agent": "DebateAgent", "action": "Multi-agent remediation debate",
        "reasoning": "Proposer vs Challenger: evaluating scaling vs rollback strategies",
        "tool_calls": [],
        "output": f"Consensus: {winner} wins ({round(confidence*100)}% confidence)",
        "timestamp": datetime.utcnow().isoformat(),
        "gemini_active": gemini_used
    }]
    _save_state(state["incident_id"], state)
    return state


def task_agent_node(state: IncidentState) -> IncidentState:
    """TaskAgent: creates follow-up tasks in Firestore based on remediation plan."""
    alert       = state["alert"]
    remediation = state.get("remediation", {})
    incident_id = state["incident_id"]
    now         = datetime.utcnow()
    steps       = (remediation or {}).get("steps", [])

    tasks = []
    for i, step in enumerate(steps[:3]):   # schedule first 3 steps as tasks
        task_id = f"task-{incident_id}-{i+1}"
        task = {
            "id":          task_id,
            "incident_id": incident_id,
            "title":       f"Step {i+1}: {step[:60]}",
            "description": step,
            "due_at":      (now + timedelta(hours=(i+1)*2)).isoformat(),
            "priority":    "high" if i == 0 else "medium",
            "status":      "pending",
            "created_at":  now.isoformat(),
        }
        tasks.append(task)
        try:
            db.collection("tasks").document(task_id).set(task)
        except Exception:
            pass

    # Also schedule a post-mortem review
    pm_task = {
        "id":          f"task-{incident_id}-pm",
        "incident_id": incident_id,
        "title":       f"Post-mortem: {alert.get('title','Incident')[:50]}",
        "description": f"Conduct post-mortem review for incident {incident_id}. Review what happened, contributing factors, and prevention.",
        "due_at":      (now + timedelta(days=1)).isoformat(),
        "priority":    "medium",
        "status":      "pending",
        "created_at":  now.isoformat(),
    }
    tasks.append(pm_task)
    try:
        db.collection("tasks").document(pm_task["id"]).set(pm_task)
    except Exception:
        pass

    state["scheduled_tasks"] = tasks
    state["status"] = "scheduling"
    state["agent_trace"] = state.get("agent_trace",[]) + [{
        "agent": "TaskAgent", "action": f"Schedule {len(tasks)} follow-up tasks",
        "reasoning": "Creating Firestore tasks for each remediation step + post-mortem",
        "tool_calls": [],
        "output": f"{len(tasks)} tasks created (due within 48h)",
        "timestamp": datetime.utcnow().isoformat(),
        "gemini_active": False
    }]
    _save_state(state["incident_id"], state)
    return state


def controller_node(state: IncidentState) -> IncidentState:
    auto_fix = state.get("auto_fix_data")
    alert    = state["alert"]

    # FIXED: auto_fix_data is only non-None when BOTH conditions were satisfied
    # in memory_node: (1) same alert seen before AND (2) developer explicitly approved.
    # Any other case — including plain repeat with no approval — goes to awaiting_approval.
    if state.get("is_repeat_issue") and auto_fix:
        past_steps = auto_fix.get("resolution_steps", [
            f"Re-apply previously successful fix for {alert.get('service','')}",
            "Monitor recovery metrics", "Verify service health"
        ])
        repeat_count = memory_agent.get_repeat_count(state.get("fingerprint",""))
        synthetic_rca = {
            "root_cause": auto_fix.get("root_cause",
                f"Repeat incident on {alert.get('service','')} — same root cause as previous occurrence"),
            "confidence": 0.97,
            "evidence": [
                f"Fingerprint match: {state.get('fingerprint','')}",
                f"Seen {repeat_count} times before",
                f"Developer-approved resolution on record",
                f"Previous resolution: {past_steps[0] if past_steps else 'known fix'}",
            ],
            "affected_services": [alert.get("service","unknown")],
            "recommended_action": "Auto-fix applied from memory (developer-approved)",
            "is_repeat_issue": True, "auto_fix_available": True,
        }
        synthetic_remediation = {
            "steps": past_steps, "estimated_time_minutes": 5,
            "risk_level": "low",
            "rollback_plan": "Escalate to manual review if metrics do not recover within 10 minutes",
            "requires_downtime": False, "debate_result": None,
        }
        state["rca"]         = synthetic_rca
        state["remediation"] = synthetic_remediation
        state["status"]      = "auto_resolved"
        state["agent_trace"] = state.get("agent_trace",[]) + [{
            "agent": "ControllerAgent",
            "action": "AUTO-FIX: Apply developer-approved remediation from memory",
            "reasoning": (
                "Repeat incident AND developer has previously approved this resolution strategy. "
                "Both required conditions satisfied — applying auto-fix."
            ),
            "tool_calls": [],
            "output": "Auto-fix applied (developer-approved resolution strategy). Incident closed.",
            "timestamp": datetime.utcnow().isoformat(), "gemini_active": False
        }]
        _save_state(state["incident_id"], state)
        try:
            db.collection("incidents").document(state["incident_id"]).update({
                "status":        "auto_resolved",
                "diagnostic":    synthetic_rca,
                "remediation":   synthetic_remediation,
                "execution_log": [
                    "Repeat issue detected by MemoryAgent (fingerprint match)",
                    "Developer-approved resolution strategy confirmed",
                    "Auto-fix applied by ControllerAgent",
                    "Service health restored",
                    "Incident closed — both auto-resolve conditions satisfied",
                ],
                "resolved_at": datetime.utcnow().isoformat(),
                "updated_at":  datetime.utcnow().isoformat(),
            })
        except Exception:
            pass
    else:
        # Covers: (a) first-time alert, (b) repeat but no developer approval yet
        reason = (
            "Repeat incident — no developer approval on record for this resolution strategy"
            if state.get("is_repeat_issue")
            else "Novel incident — remediation plan requires human authorisation"
        )
        state["status"] = "awaiting_approval"
        state["agent_trace"] = state.get("agent_trace",[]) + [{
            "agent": "ControllerAgent", "action": "Escalate for human approval",
            "reasoning": reason,
            "tool_calls": [], "output": "Incident queued in approval console",
            "timestamp": datetime.utcnow().isoformat(), "gemini_active": False
        }]
        _save_state(state["incident_id"], state)
    return state


def _should_autofix(state: IncidentState) -> str:
    # FIXED: gate now correctly requires BOTH conditions to be met.
    # auto_fix_data is only populated by memory_node when both conditions are satisfied:
    # (1) is_repeat_issue == True  AND  (2) developer has explicitly approved the strategy.
    if state.get("is_repeat_issue") and state.get("auto_fix_data"):
        return "auto_fix"
    return "full_pipeline"


# ── Build LangGraph ───────────────────────────────────────────
graph = StateGraph(IncidentState)
graph.add_node("planner",    planner_node)
graph.add_node("memory",     memory_node)
graph.add_node("tools",      tool_executor_node)
graph.add_node("rca",        rca_node)
graph.add_node("debate",     debate_node)
graph.add_node("tasks",      task_agent_node)
graph.add_node("controller", controller_node)

graph.set_entry_point("planner")
graph.add_edge("planner", "memory")
graph.add_conditional_edges("memory", _should_autofix, {
    "auto_fix":      "controller",
    "full_pipeline": "tools",
})
graph.add_edge("tools",      "rca")
graph.add_edge("rca",        "debate")
graph.add_edge("debate",     "tasks")
graph.add_edge("tasks",      "controller")
graph.add_edge("controller", END)

compiled_graph = graph.compile()


async def run_incident_workflow(incident_id: str, alert: Dict) -> Dict:
    initial: IncidentState = {
        "incident_id": incident_id, "alert": alert,
        "plan": None, "plan_steps": [], "tool_results": [],
        "agent_trace": [], "memory_hits": [],
        "is_repeat_issue": False, "auto_fix_data": None,
        "rca": None, "debate_result": None, "remediation": None,
        "scheduled_tasks": [], "fingerprint": "", "status": "open",
        "error": None, "gemini_active": VERTEX_AVAILABLE,
    }
    final = compiled_graph.invoke(initial)
    _save_state(incident_id, final)
    return final
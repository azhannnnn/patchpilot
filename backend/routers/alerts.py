"""Alert ingestion and simulation"""
from fastapi import APIRouter, HTTPException
from models.schemas import Alert, AlertSeverity, SimulateAlert
from services.incident_service import create_incident
import uuid, random
from datetime import datetime

router = APIRouter()

def _rand_meta(alert_type: str) -> dict:
    """Different numbers every run."""
    r = lambda base, pct=0.1: round(base * (1 + random.uniform(-pct, pct)), 1)
    metas = {
        "high_cpu":     {"cpu_pct": r(94.2), "threshold": 80, "duration_minutes": random.randint(8,14)},
        "oom_kill":     {"memory_mb": 512, "restarts": random.randint(2,5), "pod": f"auth-{random.randint(1000,9999)}"},
        "db_latency":   {"p99_ms": random.randint(3800,5200), "baseline_ms": 1000, "connections_used": random.randint(92,99)},
        "service_down": {"error_rate_pct": 100, "http_code": 503, "failing_checks": random.randint(3,8)},
        "disk_full":    {"disk_pct": r(95), "disk_gb": 100, "used_gb": r(95)},
    }
    return metas.get(alert_type, {})

DEMO_ALERTS = {
    "high_cpu":     {"title":"High CPU Usage Alert","description":"CPU usage has been above 90% for over 10 minutes on payment-service. Multiple threads stuck in GC cycles.","severity":AlertSeverity.HIGH,"service":"payment-service","environment":"production","source":"cloud-monitoring"},
    "oom_kill":     {"title":"OOM Kill — Container Restarted","description":"Container for auth-service was killed due to OOM. Memory limit: 512Mi. Java heap not tuned for production load.","severity":AlertSeverity.CRITICAL,"service":"auth-service","environment":"production","source":"kubernetes"},
    "db_latency":   {"title":"Database Latency Spike","description":"P99 database query latency is over 4x above normal. Connection pool nearing exhaustion.","severity":AlertSeverity.HIGH,"service":"orders-db","environment":"production","source":"cloud-sql-monitoring"},
    "service_down": {"title":"Service Unavailable — 503 Errors","description":"auth-service returning HTTP 503 for 100% of requests. Load balancer health checks failing.","severity":AlertSeverity.CRITICAL,"service":"auth-service","environment":"production","source":"uptime-check"},
    "disk_full":    {"title":"Disk Capacity Critical","description":"Cloud SQL instance disk approaching capacity. Automatic storage increase not triggered yet.","severity":AlertSeverity.MEDIUM,"service":"cloud-sql-primary","environment":"production","source":"cloud-monitoring"},
}

@router.post("/simulate")
async def simulate_alert(req: SimulateAlert):
    template = DEMO_ALERTS.get(req.alert_type)
    if not template:
        raise HTTPException(400, f"Unknown alert type: {req.alert_type}. Valid: {list(DEMO_ALERTS.keys())}")
    alert = Alert(
        id=str(uuid.uuid4())[:8],
        timestamp=datetime.utcnow().isoformat(),
        metadata=_rand_meta(req.alert_type),
        **template
    )
    result = await create_incident(alert)
    return {
        "incident_id": result["id"],
        "alert_type": req.alert_type,
        "severity": template["severity"],
        "service": template["service"],
        "status": "workflow_started",
        "workflow": "PlannerAgent → MemoryAgent → ToolAgent[parallel] → DiagnosticAgent → DebateAgent → TaskAgent → ControllerAgent"
    }

@router.post("/ingest")
async def ingest_alert(alert: Alert):
    alert.id        = alert.id or str(uuid.uuid4())[:8]
    alert.timestamp = alert.timestamp or datetime.utcnow().isoformat()
    incident = await create_incident(alert)
    return {"incident_id": incident["id"], "status": "workflow_started"}

@router.get("/types")
async def list_alert_types():
    return {"alert_types": list(DEMO_ALERTS.keys())}

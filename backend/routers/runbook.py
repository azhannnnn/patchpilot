"""Runbook library"""
from fastapi import APIRouter
from google.cloud import firestore
from datetime import datetime

router = APIRouter()
db = firestore.Client()

RUNBOOKS = [
    {"id":"rb-001","issue_type":"high_cpu","title":"High CPU Runbook","service":"any","tags":"cpu performance scaling profiling","content":"1. Identify hot threads via thread dump / profiler\n2. Check recent deployments for regressions\n3. Scale horizontally (add 2 instances)\n4. Enable CPU profiling (async-profiler)\n5. Set up CPU alerting at 70% threshold","avg_resolution_minutes":15,"success_rate":0.92},
    {"id":"rb-002","issue_type":"oom_kill","title":"OOM Kill Recovery","service":"any","tags":"memory oom container jvm heap","content":"1. Capture heap dump before restart (jmap)\n2. Increase memory limit to 1Gi\n3. Restart pods with rolling update\n4. Add GC tuning flags (-Xmx, G1GC)\n5. Set up memory alerts at 80%","avg_resolution_minutes":20,"success_rate":0.88},
    {"id":"rb-003","issue_type":"db_latency","title":"DB Latency Mitigation","service":"any","tags":"database latency query sql connection-pool","content":"1. Run EXPLAIN ANALYZE on top 5 slow queries\n2. Check connection pool exhaustion\n3. Scale read replicas (add 1)\n4. Add query result caching (Redis)\n5. Set slow query log threshold to 500ms","avg_resolution_minutes":30,"success_rate":0.85},
    {"id":"rb-004","issue_type":"service_down","title":"Service Recovery — 503","service":"any","tags":"503 availability health-check lb","content":"1. Check load balancer health check endpoints\n2. Inspect pod restart logs for crash cause\n3. Rollback if correlated with recent deployment\n4. Scale up healthy instance pool\n5. Notify dependent services","avg_resolution_minutes":10,"success_rate":0.95},
    {"id":"rb-005","issue_type":"disk_full","title":"Disk Full Remediation","service":"any","tags":"disk storage sql capacity","content":"1. Identify largest files with du -sh\n2. Enable Cloud SQL auto-storage-increase\n3. Archive old logs to Cloud Storage\n4. Set disk alert at 80%\n5. Schedule regular log rotation","avg_resolution_minutes":25,"success_rate":0.90},
]

def _dedup(runbooks):
    seen, result = set(), []
    for rb in runbooks:
        k = (rb.get("issue_type") or rb.get("title") or "").lower()
        if k not in seen:
            seen.add(k); result.append(rb)
    return result

@router.get("/")
async def list_runbooks(q: str = None, service: str = None, issue_type: str = None):
    docs = [d.to_dict() for d in db.collection("runbooks").stream()]
    docs = _dedup(docs)
    if issue_type: docs = [r for r in docs if r.get("issue_type","").lower() == issue_type.lower()]
    if service:    docs = [r for r in docs if r.get("service","").lower() in [service.lower(),"any"]]
    if q:
        ql = q.lower()
        docs = [r for r in docs if any(ql in (r.get(f,"") or "").lower() for f in ["title","tags","issue_type","content"])]
    return docs

@router.post("/seed")
async def seed_runbooks():
    for rb in RUNBOOKS:
        db.collection("runbooks").document(f"rb-{rb['issue_type']}").set(
            {**rb, "seeded_at": datetime.utcnow().isoformat()}, merge=True)
    return {"seeded": len(RUNBOOKS)}

@router.get("/issue-types")
async def list_issue_types():
    docs = db.collection("runbooks").stream()
    types = sorted(set(d.to_dict().get("issue_type","") for d in docs if d.to_dict().get("issue_type")))
    return {"issue_types": types}

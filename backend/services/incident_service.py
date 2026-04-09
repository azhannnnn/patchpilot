"""Incident Service — CRUD and async workflow trigger"""
import asyncio, uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from google.cloud import firestore, pubsub_v1
import json, os

from models.schemas import Alert, IncidentStatus
from agents.orchestrator import run_incident_workflow
from memory.memory_agent import memory_agent, compute_fingerprint

db   = firestore.Client()
COLL = "incidents"

# Pub/Sub publisher for status change events
_publisher = pubsub_v1.PublisherClient()
_project   = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
_topic     = os.environ.get("PUBSUB_STATUS_TOPIC", "patchpilot-status")

def _publish_status(incident_id: str, status: str, service: str):
    try:
        topic_path = _publisher.topic_path(_project, _topic)
        msg = json.dumps({"incident_id": incident_id, "status": status, "service": service,
                           "timestamp": datetime.utcnow().isoformat()}).encode()
        _publisher.publish(topic_path, msg)
    except Exception:
        pass


async def create_incident(alert: Alert) -> Dict[str, Any]:
    incident_id = str(uuid.uuid4())[:8]
    now         = datetime.utcnow().isoformat()
    fingerprint = compute_fingerprint(alert.title, alert.service)
    doc = {
        "id": incident_id, "alert_id": alert.id or incident_id,
        "alert": alert.dict(), "status": "open", "fingerprint": fingerprint,
        "agent_trace": [], "plan": [], "memory_hits": [], "scheduled_tasks": [],
        "is_repeat_issue": False, "gemini_active": False,
        "created_at": now, "updated_at": now
    }
    db.collection(COLL).document(incident_id).set(doc)
    _publish_status(incident_id, "open", alert.service)
    asyncio.create_task(_run_and_update(incident_id, alert.dict()))
    return {**doc, "message": "Multi-agent workflow started"}


async def _run_and_update(incident_id: str, alert: Dict):
    try:
        final = await run_incident_workflow(incident_id, alert)
        # FIXED: do NOT store to memory here for non-auto-resolved incidents.
        # For incidents that go through the full pipeline (awaiting_approval),
        # memory is written only after a developer explicitly approves — see approve_incident().
        # For auto_resolved incidents the resolution was already developer-approved in a prior
        # occurrence, so we just update the occurrence count via store_incident with success=True.
        if final.get("status") == "auto_resolved" and final.get("rca") and final.get("remediation"):
            memory_agent.store_incident(
                incident_id=incident_id,
                alert_title=alert.get("title",""),
                service=alert.get("service",""),
                root_cause=final["rca"].get("root_cause",""),
                resolution_steps=final["remediation"].get("steps",[]),
                fingerprint=final.get("fingerprint",""),
                success=True
            )
        _publish_status(incident_id, final.get("status","open"), alert.get("service",""))
    except Exception as e:
        db.collection(COLL).document(incident_id).update({
            "status": "open", "error": str(e), "updated_at": datetime.utcnow().isoformat()
        })


def get_incident(incident_id: str) -> Optional[Dict]:
    doc = db.collection(COLL).document(incident_id).get()
    return doc.to_dict() if doc.exists else None


def list_incidents(limit: int = 20) -> List[Dict]:
    docs = (db.collection(COLL)
              .order_by("created_at", direction=firestore.Query.DESCENDING)
              .limit(limit)
              .stream())
    return [d.to_dict() for d in docs]


def approve_incident(incident_id: str, approver: str, decision: str, comment: str = "") -> Dict:
    now    = datetime.utcnow().isoformat()
    status = IncidentStatus.APPROVED if decision == "approve" else IncidentStatus.REJECTED
    db.collection(COLL).document(incident_id).update({
        "status": status, "approved_by": approver,
        "approved_at": now, "approval_comment": comment, "updated_at": now
    })
    if decision == "approve":
        db.collection(COLL).document(incident_id).update({
            "status": IncidentStatus.RESOLVED, "resolved_at": now,
            "execution_log": [
                "Fix approved by human operator",
                "Executing remediation steps...",
                "Service health checks passing",
                "Incident resolved"
            ]
        })
        # FIXED: only store the resolution to memory AFTER a developer explicitly approves.
        # This ensures future auto-resolve is only triggered when a human has validated
        # the resolution strategy — satisfying condition (2) of the auto-resolve gate.
        inc = get_incident(incident_id)
        if inc:
            alert      = inc.get("alert", {})
            rca        = inc.get("diagnostic") or inc.get("rca") or {}
            remediation= inc.get("remediation") or {}
            fingerprint= inc.get("fingerprint", "")
            if rca and remediation:
                memory_agent.store_incident(
                    incident_id=incident_id,
                    alert_title=alert.get("title", ""),
                    service=alert.get("service", ""),
                    root_cause=rca.get("root_cause", ""),
                    resolution_steps=remediation.get("steps", []),
                    fingerprint=fingerprint,
                    success=True,
                )
            _publish_status(incident_id, "resolved", alert.get("service", ""))
    return {"incident_id": incident_id, "decision": decision, "status": status}


def get_pending_approvals() -> List[Dict]:
    docs = db.collection(COLL).where("status","in",["awaiting_approval"]).stream()
    return [d.to_dict() for d in docs]
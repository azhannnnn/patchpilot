"""Task Service — CRUD for scheduled tasks (TaskAgent output)"""
import uuid
from datetime import datetime
from typing import List, Optional, Dict
from google.cloud import firestore

db   = firestore.Client()
COLL = "tasks"

def list_tasks(incident_id: str = None, status: str = None, limit: int = 50) -> List[Dict]:
    q = db.collection(COLL)
    if incident_id:
        q = q.where("incident_id", "==", incident_id)
    if status:
        q = q.where("status", "==", status)
    return [d.to_dict() for d in q.limit(limit).stream()]

def complete_task(task_id: str) -> Dict:
    now = datetime.utcnow().isoformat()
    db.collection(COLL).document(task_id).update({
        "status": "completed", "completed_at": now
    })
    return {"task_id": task_id, "status": "completed"}

def get_task(task_id: str) -> Optional[Dict]:
    doc = db.collection(COLL).document(task_id).get()
    return doc.to_dict() if doc.exists else None

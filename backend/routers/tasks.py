"""Task management endpoints (TaskAgent output)"""
from fastapi import APIRouter
from services.task_service import list_tasks, complete_task, get_task

router = APIRouter()

@router.get("/")
async def get_tasks(incident_id: str = None, status: str = None):
    return list_tasks(incident_id=incident_id, status=status)

@router.post("/{task_id}/complete")
async def mark_complete(task_id: str):
    return complete_task(task_id)

@router.get("/{task_id}")
async def get_task_by_id(task_id: str):
    task = get_task(task_id)
    return task or {"error": "not found"}

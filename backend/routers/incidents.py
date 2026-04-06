"""Incident CRUD"""
from fastapi import APIRouter, HTTPException
from services.incident_service import get_incident, list_incidents

router = APIRouter()

@router.get("/")
async def get_incidents(limit: int = 20):
    return list_incidents(limit)

@router.get("/{incident_id}")
async def get_incident_by_id(incident_id: str):
    inc = get_incident(incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    return inc

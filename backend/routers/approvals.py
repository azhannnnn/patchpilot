"""Human-in-the-loop approval"""
from fastapi import APIRouter
from models.schemas import ApprovalRequest
from services.incident_service import approve_incident, get_pending_approvals

router = APIRouter()

@router.get("/pending")
async def pending_approvals():
    return get_pending_approvals()

@router.post("/decide")
async def decide(request: ApprovalRequest):
    return approve_incident(
        incident_id=request.incident_id,
        approver=request.approver_name,
        decision=request.decision,
        comment=request.comment or ""
    )

"""Pydantic schemas for PatchPilot v5"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum

class AlertSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class IncidentStatus(str, Enum):
    OPEN = "open"
    PLANNING = "planning"
    DIAGNOSING = "diagnosing"
    DEBATING = "debating"
    SCHEDULING = "scheduling"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    RESOLVED = "resolved"
    AUTO_RESOLVED = "auto_resolved"
    CLOSED = "closed"

class Alert(BaseModel):
    id: Optional[str] = None
    title: str
    description: str
    severity: AlertSeverity
    service: str
    environment: str = "production"
    timestamp: Optional[str] = None
    source: str = "monitoring"
    metadata: Dict[str, Any] = {}

class ToolCall(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]
    result: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    source: str = "mocked"  # "gcp_monitoring" | "gcp_logging" | "gcp_run" | "mocked"

class AgentStep(BaseModel):
    agent: str
    action: str
    reasoning: str
    tool_calls: List[ToolCall] = []
    output: Optional[str] = None
    timestamp: Optional[str] = None
    gemini_active: bool = False

class DebateRound(BaseModel):
    proposer_fix: str
    challenger_fix: str
    proposer_reasoning: str
    challenger_reasoning: str
    final_verdict: str
    consensus_confidence: float
    winner: str = "PROPOSER"
    winning_steps: List[str] = []

class DiagnosticResult(BaseModel):
    root_cause: str
    confidence: float
    evidence: List[str]
    affected_services: List[str]
    similar_past_incidents: List[str] = []
    fingerprint: Optional[str] = None
    is_repeat_issue: bool = False
    auto_fix_available: bool = False

class RemediationPlan(BaseModel):
    steps: List[str]
    estimated_time_minutes: int
    risk_level: str
    rollback_plan: str
    requires_downtime: bool = False
    debate_result: Optional[DebateRound] = None

class ScheduledTask(BaseModel):
    id: Optional[str] = None
    incident_id: str
    title: str
    description: str
    due_at: Optional[str] = None
    priority: str = "medium"
    status: str = "pending"
    created_at: Optional[str] = None
    completed_at: Optional[str] = None

class Incident(BaseModel):
    id: Optional[str] = None
    alert_id: str
    alert: Optional[Alert] = None
    status: IncidentStatus = IncidentStatus.OPEN
    diagnostic: Optional[DiagnosticResult] = None
    remediation: Optional[RemediationPlan] = None
    agent_trace: List[AgentStep] = []
    plan: Optional[List[str]] = None
    memory_hits: List[str] = []
    execution_log: List[str] = []
    scheduled_tasks: List[ScheduledTask] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    resolved_at: Optional[str] = None
    approved_by: Optional[str] = None
    fingerprint: Optional[str] = None
    gemini_active: bool = False

class ApprovalRequest(BaseModel):
    incident_id: str
    approver_name: str
    decision: str
    comment: Optional[str] = None

class SimulateAlert(BaseModel):
    alert_type: str = "high_cpu"

class MCPRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: Optional[Any] = None
    method: str
    params: Optional[Dict[str, Any]] = None

class MCPResponse(BaseModel):
    jsonrpc: str = "2.0"
    id: Optional[Any] = None
    result: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None

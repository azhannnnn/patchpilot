"""PatchPilot v5 — FastAPI Backend"""
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from middleware.auth import api_key_middleware

from routers import (
    alerts, incidents, approvals, runbook,
    agents as agents_router, tasks, ws as ws_router, mcp_server
)

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="PatchPilot v5 API",
    description="Autonomous Multi-Agent Incident Response — 7 agents, 8 MCP tools, real GCP APIs",
    version="5.0.0"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.middleware("http")(api_key_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

app.include_router(alerts.router,         prefix="/api/alerts",    tags=["Alerts"])
app.include_router(incidents.router,      prefix="/api/incidents", tags=["Incidents"])
app.include_router(approvals.router,      prefix="/api/approvals", tags=["Approvals"])
app.include_router(runbook.router,        prefix="/api/runbook",   tags=["Runbook"])
app.include_router(agents_router.router,  prefix="/api/agents",    tags=["Agents"])
app.include_router(tasks.router,          prefix="/api/tasks",     tags=["Tasks"])
app.include_router(ws_router.router,      tags=["WebSocket"])
app.include_router(mcp_server.router,     tags=["MCP"])

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "patchpilot-v5",
        "agents": ["planner","memory","tool[parallel]","diagnostic","debate","task","controller"],
        "mcp_tools": 8,
        "mcp_protocol": "JSON-RPC 2.0",
        "gcp_apis": ["cloud_monitoring","cloud_logging","cloud_run","firestore","pubsub"]
    }

@app.get("/")
async def root():
    return {"message": "PatchPilot v5 API", "docs": "/docs", "mcp": "/mcp"}

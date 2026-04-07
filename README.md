# PatchPilot

Autonomous on-call incident response agent. When a production alert fires, PatchPilot diagnoses the root cause, proposes a fix, and either executes it automatically or routes it for one-click human approval — no engineer required for known patterns.

Built for the **Google Gen AI Hackathon** using Gemini, ADK, MCP, and Cloud Run.

> **Repo:** [github.com/azhannnnn/patchpilot](https://github.com/azhannnnn/patchpilot)

---

## Architecture

```
Alert (Pub/Sub)
  └── PlannerAgent       — Gemini function-calling, decomposes the alert
        └── MemoryAgent  — FAISS + Firestore fingerprint match
              └── ToolAgent [parallel]  — 8 MCP tools via asyncio.gather
                    └── DiagnosticAgent — Gemini RCA synthesis
                          └── DebateAgent  — dual Gemini instances, adversarial
                                └── TaskAgent    — Firestore follow-up scheduling
                                      └── ControllerAgent — approve or auto-fix
```

**Services used:** Vertex AI (Gemini 1.5 Pro) · Firestore · Cloud Run · Pub/Sub · Cloud Monitoring · Cloud Logging · Artifact Registry · Secret Manager

---

## Prerequisites

- Google Cloud project with billing enabled
- `gcloud` CLI authenticated (`gcloud auth login`)
- Project set: `gcloud config set project YOUR_PROJECT_ID`

---

## Deploy

Run entirely from **Google Cloud Shell**:

```bash
git clone https://github.com/azhannnnn/patchpilot.git
cd patchpilot
chmod +x setup.sh && ./setup.sh
```

The script handles everything: enabling APIs, provisioning infrastructure, building Docker images, deploying to Cloud Run, seeding the runbook knowledge base, and firing a warm-up alert.

Deployment output is saved to `~/patchpilot_outputs/urls.txt`.

---

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Frontend dashboard |
| `POST /api/alerts/simulate` | Fire a simulated alert |
| `GET /api/incidents/` | List all incidents |
| `GET /api/approvals/pending` | Pending fix proposals |
| `POST /api/approvals/{id}/approve` | Approve and execute a fix |
| `GET /api/tasks/` | TaskAgent scheduled tasks |
| `POST /mcp` | MCP JSON-RPC 2.0 server |
| `WS /ws/{incident_id}` | Real-time agent trace stream |
| `GET /docs` | Swagger UI |

---

## MCP Protocol

PatchPilot exposes a spec-compliant MCP server at `/mcp`:

```bash
# List tools
curl -X POST $BACKEND_URL/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool
curl -X POST $BACKEND_URL/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_metrics","arguments":{"service":"api-gateway"}}}'
```

**Available tools:** `get_metrics` · `get_logs` · `get_deployment_history` · `check_disk` · `check_network` · `check_db_latency` · `search_runbooks` · `get_dependencies`

---

## Simulating Alerts

```bash
BACKEND_URL=https://your-backend-url

curl -X POST $BACKEND_URL/api/alerts/simulate \
  -H 'Content-Type: application/json' \
  -d '{"alert_type":"oom_kill"}'

# Other types: high_cpu | db_latency | service_down | disk_full
```

---

## Demo Flow

1. Open the frontend → select **OOM Kill** → click **Fire Alert**
2. Watch the 7-agent pipeline animate in real time (WebSocket)
3. Open the incident → check **Diagnosis**, **Debate**, **Agent Trace**, **Tasks** tabs
4. Go to **Approval Queue** → enter your name → **Approve & Execute**
5. Fire the same alert again → auto-resolved in <2s via memory fingerprint

---

## Stack

| Layer | Technology |
|---|---|
| LLM | Gemini 1.5 Pro (Vertex AI) |
| Agent framework | Google ADK + LangGraph |
| Tool protocol | MCP (JSON-RPC 2.0) |
| Vector memory | FAISS |
| Backend | FastAPI + Uvicorn |
| Frontend | React + Vite |
| Database | Cloud Firestore |
| Messaging | Cloud Pub/Sub |
| Deployment | Cloud Run |
| Auth / secrets | Secret Manager + API key middleware |

---

## License

MIT

--- 

## 👥 Team 

Built with ❤️ for the *Google Gen AI Hackathon* 

--- 

PatchPilot — Because the best on-call engineer is one that never sleeps.

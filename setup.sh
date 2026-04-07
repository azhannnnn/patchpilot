#!/bin/bash
set -e
set -o pipefail

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' B='\033[1m' N='\033[0m'
info()    { echo -e "${C}[INFO]${N} $1"; }
ok()      { echo -e "${G}[ OK ]${N} $1"; }
warn()    { echo -e "${Y}[WARN]${N} $1"; }
section() { echo -e "\n${C}${B}━━━ $1 ━━━${N}\n"; }
err()     { echo -e "${R}[ERR ]${N} $1"; exit 1; }

export PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
export REGION="us-central1"
export BACKEND_SERVICE="patchpilot-backend"
export FRONTEND_SERVICE="patchpilot-frontend"
export PUBSUB_TOPIC="patchpilot-alerts"
export PUBSUB_STATUS_TOPIC="patchpilot-status"
export WORKDIR="$HOME/patchpilot_v5"
export API_KEY="pp-$(openssl rand -hex 16 2>/dev/null || echo 'pp-changeme')"

[ -z "$PROJECT_ID" ] && err "No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"

section "GCP Config"
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"
ok "Project: $PROJECT_ID"

section "Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  pubsub.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  secretmanager.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --quiet
ok "APIs enabled"

section "Artifact Registry"
gcloud artifacts repositories create patchpilot-repo \
  --repository-format=docker \
  --location="$REGION" \
  --description="PatchPilot images" \
  --quiet 2>/dev/null || warn "Registry already exists"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
ok "Artifact Registry ready"

section "IAM"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for role in \
  roles/datastore.user \
  roles/pubsub.subscriber \
  roles/pubsub.publisher \
  roles/aiplatform.user \
  roles/monitoring.viewer \
  roles/logging.viewer \
  roles/run.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$role" --quiet 2>/dev/null || true
done
ok "IAM configured"

section "Firestore"
gcloud firestore databases create --location="us-central1" --quiet 2>/dev/null || warn "Firestore already exists"
ok "Firestore ready"

section "Pub/Sub"
gcloud pubsub topics create "$PUBSUB_TOPIC"        --quiet 2>/dev/null || true
gcloud pubsub topics create "$PUBSUB_STATUS_TOPIC" --quiet 2>/dev/null || true
gcloud pubsub subscriptions create "patchpilot-alerts-sub" \
  --topic="$PUBSUB_TOPIC" --quiet 2>/dev/null || true
gcloud pubsub subscriptions create "patchpilot-status-sub" \
  --topic="$PUBSUB_STATUS_TOPIC" --quiet 2>/dev/null || true
ok "Pub/Sub ready"

section "Secret Manager"
echo -n "$API_KEY" | gcloud secrets create patchpilot-api-key \
  --data-file=- --replication-policy=automatic --quiet 2>/dev/null || \
  echo -n "$API_KEY" | gcloud secrets versions add patchpilot-api-key \
  --data-file=- --quiet 2>/dev/null || true
ok "API key stored"

section "Build & Deploy Backend"
BACKEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/patchpilot-repo/patchpilot-backend:latest"
cd "$WORKDIR/backend"
gcloud builds submit --tag "$BACKEND_IMAGE" --timeout=20m --quiet
gcloud run deploy "$BACKEND_SERVICE" \
  --image="$BACKEND_IMAGE" \
  --platform=managed \
  --region="$REGION" \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=2 \
  --min-instances=1 \
  --max-instances=5 \
  --port=8080 \
  --timeout=300 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},REGION=${REGION},PUBSUB_TOPIC=${PUBSUB_TOPIC},PUBSUB_STATUS_TOPIC=${PUBSUB_STATUS_TOPIC}" \
  --quiet

BACKEND_URL=$(gcloud run services describe "$BACKEND_SERVICE" \
  --platform=managed --region="$REGION" --format='value(status.url)')
ok "Backend: $BACKEND_URL"

section "Build & Deploy Frontend"
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/patchpilot-repo/patchpilot-frontend:latest"
cd "$WORKDIR/frontend"
gcloud builds submit \
  --tag "$FRONTEND_IMAGE" \
  --build-arg "VITE_API_URL=${BACKEND_URL}" \
  --timeout=10m --quiet
gcloud run deploy "$FRONTEND_SERVICE" \
  --image="$FRONTEND_IMAGE" \
  --platform=managed \
  --region="$REGION" \
  --allow-unauthenticated \
  --memory=256Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --port=8080 \
  --quiet

FRONTEND_URL=$(gcloud run services describe "$FRONTEND_SERVICE" \
  --platform=managed --region="$REGION" --format='value(status.url)')
ok "Frontend: $FRONTEND_URL"

section "Seed & Warm-up"
sleep 20
curl -sf -X POST "${BACKEND_URL}/api/runbook/seed" \
  -H "Content-Type: application/json" --max-time 60 > /dev/null
sleep 5
curl -sf -X POST "${BACKEND_URL}/api/alerts/simulate" \
  -H "Content-Type: application/json" \
  -d '{"alert_type":"high_cpu"}' --max-time 30 > /dev/null
ok "Runbooks seeded, warm-up alert fired"

mkdir -p "$HOME/patchpilot_outputs"
cat > "$HOME/patchpilot_outputs/urls.txt" << EOF
Frontend:   ${FRONTEND_URL}
Backend:    ${BACKEND_URL}
API Docs:   ${BACKEND_URL}/docs
MCP Server: ${BACKEND_URL}/mcp
API Key:    ${API_KEY}
EOF

echo ""
echo -e "${C}${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "${G}${B}  PatchPilot is live${N}"
echo -e "${C}${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "  Frontend:   ${Y}${FRONTEND_URL}${N}"
echo -e "  Backend:    ${Y}${BACKEND_URL}${N}"
echo -e "  API Docs:   ${Y}${BACKEND_URL}/docs${N}"
echo -e "  MCP:        ${Y}${BACKEND_URL}/mcp${N}"
echo -e "  Saved to:   ~/patchpilot_outputs/urls.txt"
echo ""

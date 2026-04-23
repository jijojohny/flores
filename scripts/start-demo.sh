#!/bin/bash
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# ─── Node 22 guard ────────────────────────────────────────────
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
command -v nvm >/dev/null 2>&1 && nvm use 22 || true

# ─── Ports & demo tuning (override with env) ──────────────────
export DASHBOARD_PORT="${DASHBOARD_PORT:-3004}"
export DATA_AGENT_PORT="${DATA_AGENT_PORT:-3001}"
export COMPUTE_AGENT_PORT="${COMPUTE_AGENT_PORT:-3002}"
export ANALYST_AGENT_PORT="${ANALYST_AGENT_PORT:-3003}"
export LENDER_AGENT_PORT="${LENDER_AGENT_PORT:-3005}"
export AUDITOR_AGENT_PORT="${AUDITOR_AGENT_PORT:-3006}"
export DEMO_ITERATIONS="${DEMO_ITERATIONS:-8}"
export DEMO_ITERATION_DELAY_MS="${DEMO_ITERATION_DELAY_MS:-4000}"
export DEMO_LOAN_AMOUNT_USDC="${DEMO_LOAN_AMOUNT_USDC:-10}"
export HEALTH_WAIT_TIMEOUT="${HEALTH_WAIT_TIMEOUT:-120}"

AGENTS="$REPO/agents"

wait_json_health() {
  local url="$1"
  local label="$2"
  local want="${3:-ok}"
  local t=0
  while [ "$t" -lt "$HEALTH_WAIT_TIMEOUT" ]; do
    body="$(curl -sf "$url" 2>/dev/null || true)"
    if echo "$body" | grep -q "\"status\":\"$want\""; then
      echo "  $label ready ($url)"
      return 0
    fi
    sleep 0.5
    t=$((t + 1))
  done
  echo "Timeout waiting for $label ($url)"
  return 1
}

wait_http_200() {
  local url="$1"
  local label="$2"
  local t=0
  while [ "$t" -lt "$HEALTH_WAIT_TIMEOUT" ]; do
    if curl -sf -o /dev/null "$url" 2>/dev/null; then
      echo "  $label responding ($url)"
      return 0
    fi
    sleep 0.5
    t=$((t + 1))
  done
  echo "Timeout waiting for $label ($url)"
  return 1
}

echo "Starting AgentCredit demo..."
echo "Arc Explorer:  https://testnet.arcscan.app"
echo "Dashboard:     http://localhost:${DASHBOARD_PORT}"
echo "Demo:          iterations=$DEMO_ITERATIONS delay_ms=$DEMO_ITERATION_DELAY_MS loan_usdc=$DEMO_LOAN_AMOUNT_USDC"
echo ""

pkill -f "AnalystAgent.ts" 2>/dev/null || true
pkill -f "AuditorAgent.ts"  2>/dev/null || true
pkill -f "LenderAgent.ts"   2>/dev/null || true
pkill -f "DataAgent.ts"     2>/dev/null || true
pkill -f "ComputeAgent.ts"  2>/dev/null || true
sleep 1

for PORT in "$DATA_AGENT_PORT" "$COMPUTE_AGENT_PORT" "$ANALYST_AGENT_PORT" "$DASHBOARD_PORT" "$LENDER_AGENT_PORT" "$AUDITOR_AGENT_PORT"; do
  fuser -k "${PORT}/tcp" 2>/dev/null || true
done
sleep 1

echo "[0/5] Starting dashboard on http://localhost:${DASHBOARD_PORT}..."
(cd "$REPO/dashboard" && npx next dev --port "$DASHBOARD_PORT" > /tmp/dashboard.log 2>&1) &
DASHBOARD_PID=$!
wait_http_200 "http://localhost:${DASHBOARD_PORT}/" "Dashboard"

echo "[1/5] Starting DataAgent on :${DATA_AGENT_PORT}..."
(cd "$AGENTS" && npx tsx src/agents/DataAgent.ts) > /tmp/data-agent.log 2>&1 &
DATA_PID=$!

echo "[2/5] Starting ComputeAgent on :${COMPUTE_AGENT_PORT}..."
(cd "$AGENTS" && npx tsx src/agents/ComputeAgent.ts) > /tmp/compute-agent.log 2>&1 &
COMPUTE_PID=$!

wait_json_health "http://localhost:${DATA_AGENT_PORT}/health" "DataAgent"
wait_json_health "http://localhost:${COMPUTE_AGENT_PORT}/health" "ComputeAgent"

echo "[3/5] Starting LenderAgent (deposits pool on startup)..."
(cd "$AGENTS" && npx tsx src/agents/LenderAgent.ts) > /tmp/lender-agent.log 2>&1 &
LENDER_PID=$!
wait_json_health "http://localhost:${LENDER_AGENT_PORT}/health" "LenderAgent" "ok"

echo "[4/5] Starting AnalystAgent..."
(cd "$AGENTS" && npx tsx src/agents/AnalystAgent.ts) > /tmp/analyst-agent.log 2>&1 &
ANALYST_PID=$!
wait_json_health "http://localhost:${ANALYST_AGENT_PORT}/health" "AnalystAgent"

echo "[5/5] Starting AuditorAgent..."
(cd "$AGENTS" && npx tsx src/agents/AuditorAgent.ts) > /tmp/auditor-agent.log 2>&1 &
AUDITOR_PID=$!
wait_json_health "http://localhost:${AUDITOR_AGENT_PORT}/health" "AuditorAgent"

echo ""
echo "All agents running!"
echo "  Dashboard:  http://localhost:${DASHBOARD_PORT}"
echo "  PIDs: data=$DATA_PID compute=$COMPUTE_PID lender=$LENDER_PID analyst=$ANALYST_PID auditor=$AUDITOR_PID dashboard=$DASHBOARD_PID"
echo "Press Ctrl+C to stop all agents."

trap "echo 'Stopping agents...'; kill $DATA_PID $COMPUTE_PID $LENDER_PID $ANALYST_PID $AUDITOR_PID $DASHBOARD_PID 2>/dev/null" EXIT INT TERM

wait $ANALYST_PID
echo "AnalystAgent finished. All ${DEMO_ITERATIONS} iterations complete."

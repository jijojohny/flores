#!/bin/bash
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# ─── Node 22 guard ────────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
nvm use 22

echo "Starting AgentCredit demo..."
echo "Arc Explorer:  https://testnet.arcscan.app"
echo "Dashboard:     http://localhost:3004"
echo ""

# Kill any leftover agent processes (prevents nonce collisions on restart)
pkill -f "AnalystAgent.ts" 2>/dev/null || true
pkill -f "AuditorAgent.ts"  2>/dev/null || true
pkill -f "LenderAgent.ts"   2>/dev/null || true
pkill -f "DataAgent.ts"     2>/dev/null || true
pkill -f "ComputeAgent.ts"  2>/dev/null || true
sleep 1

# Kill any leftover processes on our ports
for PORT in 3001 3002 3003 3004; do
  fuser -k ${PORT}/tcp 2>/dev/null || true
done

AGENTS="$REPO/agents"

# 0. Start dashboard dev server
echo "[0/5] Starting dashboard on http://localhost:3004..."
(cd "$REPO/dashboard" && npx next dev --port 3004 > /tmp/dashboard.log 2>&1) &
DASHBOARD_PID=$!

# 1. Start service agents (sellers)
echo "[1/5] Starting DataAgent on :3001..."
(cd "$AGENTS" && npx tsx src/agents/DataAgent.ts) > /tmp/data-agent.log 2>&1 &
DATA_PID=$!

echo "[2/5] Starting ComputeAgent on :3002..."
(cd "$AGENTS" && npx tsx src/agents/ComputeAgent.ts) > /tmp/compute-agent.log 2>&1 &
COMPUTE_PID=$!

sleep 3

# 2. Start capital + auditing agents
echo "[3/5] Starting LenderAgent (deposits pool on startup)..."
(cd "$AGENTS" && npx tsx src/agents/LenderAgent.ts) > /tmp/lender-agent.log 2>&1 &
LENDER_PID=$!

echo "[4/5] Starting AuditorAgent (waits for AnalystAgent WS)..."
(cd "$AGENTS" && npx tsx src/agents/AuditorAgent.ts) > /tmp/auditor-agent.log 2>&1 &
AUDITOR_PID=$!

sleep 4

# 3. Start AnalystAgent last — kicks off the 8-iteration loop
echo "[5/5] Starting AnalystAgent (8 iterations, borrow→use→repay)..."
(cd "$AGENTS" && npx tsx src/agents/AnalystAgent.ts) > /tmp/analyst-agent.log 2>&1 &
ANALYST_PID=$!

echo ""
echo "All agents running!"
echo "  Dashboard:  http://localhost:3004"
echo "  PIDs: data=$DATA_PID compute=$COMPUTE_PID lender=$LENDER_PID auditor=$AUDITOR_PID analyst=$ANALYST_PID dashboard=$DASHBOARD_PID"
echo "Press Ctrl+C to stop all agents."

# Cleanup on exit
trap "echo 'Stopping agents...'; kill $DATA_PID $COMPUTE_PID $LENDER_PID $AUDITOR_PID $ANALYST_PID $DASHBOARD_PID 2>/dev/null" EXIT INT TERM

wait $ANALYST_PID
echo "AnalystAgent finished. All 8 iterations complete."

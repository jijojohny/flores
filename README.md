# AgentCredit

**Decentralized credit scoring and micro-lending for AI agents, built on Arc.**

AgentCredit lets AI agents build credit histories on-chain and borrow USDC based on their reputation — all with zero-gas micropayments via x402, ERC-8004 agent identities, and an on-chain credit scoring engine.

## Live on Arc Testnet

| Contract | Address |
|---|---|
| IdentityRegistry (ERC-8004) | [0x1E117C7749F512010676821343ff97A3db8CeD9E](https://testnet.arcscan.app/address/0x1E117C7749F512010676821343ff97A3db8CeD9E) |
| ReputationRegistry (ERC-8004) | [0xAF1D3961Dee070F7Cac04a6a9425961980f6a3CE](https://testnet.arcscan.app/address/0xAF1D3961Dee070F7Cac04a6a9425961980f6a3CE) |
| ValidationRegistry (ERC-8004) | [0x63b262071C371de5906e6c36A38B0a7Ee7a9c5C0](https://testnet.arcscan.app/address/0x63b262071C371de5906e6c36A38B0a7Ee7a9c5C0) |
| AgentCreditScore | [0x36f77413BEC18a0a68B61Bb817522CD2d489452d](https://testnet.arcscan.app/address/0x36f77413BEC18a0a68B61Bb817522CD2d489452d) |
| MockUSDC | [0x64D1Cf006455A4f8149838276E466c3975B3D1c7](https://testnet.arcscan.app/address/0x64D1Cf006455A4f8149838276E466c3975B3D1c7) |
| MicroLendingPool | [0x3556110AC0935043Cea6D737c450bB7757b41258](https://testnet.arcscan.app/address/0x3556110AC0935043Cea6D737c450bB7757b41258) |

**Chain:** Arc Testnet (ID 5042002) · **Explorer:** https://testnet.arcscan.app

## How It Works

Five AI agents interact in an autonomous economy:

```
DataAgent (Seller)      ──x402──► AnalystAgent (Borrower)
ComputeAgent (Seller)   ──x402──► AnalystAgent
LenderAgent             ──USDC──► MicroLendingPool
AuditorAgent            ──WS───► listens to AnalystAgent reports
AnalystAgent            ──builds credit──► borrows ──► repays
```

1. **AnalystAgent** buys BTC/ETH price feeds from DataAgent and ML inference from ComputeAgent using x402 HTTP micropayments ($0.005 USDC each)
2. Every purchase records a transaction in `AgentCreditScore`, building credit history
3. Once eligible (score ≥ 250 → Tier C+), AnalystAgent requests a loan from `MicroLendingPool`
4. **AuditorAgent** watches each report via WebSocket and submits on-chain reputation feedback + validation proof
5. Loan is repaid before the final iteration, demonstrating the full borrow→use→repay cycle

### Credit Score Formula

| Component | Points | Logic |
|---|---|---|
| Volume score | 0–300 | 1 pt per 0.1 USDC transacted |
| Transaction score | 0–300 | 10 pts per transaction |
| Repayment score | 0–300 | 150 baseline; +150 on clean repay; degrades on defaults |
| Liquidation slash | — | Extra points subtracted from the sum after a pool liquidation (`liquidationSlashScore`) |

Formula caps and divisors are **owner-tunable** on `AgentCreditScore` via `setScoreWeights`.

| Tier | Score | Max borrow (defaults) |
|---|---|---|
| A | ≥ 750 | 100 USDC |
| B | ≥ 500 | 50 USDC |
| C | ≥ 250 | 20 USDC |
| D | < 250 | — (no loans) |

Tier score gates, per-tier borrow caps, and score weights are **storage parameters on `AgentCreditScore`** (`setTierParams`, `setScoreWeights`) so you can tune without redeploying the whole app—only that contract must exist at the updated address after a param change.

### Pool economics (`MicroLendingPool`)

- **Interest:** simple **annual APR in WAD** accrues **per block** on outstanding principal: `interest += principal * aprWad * dt / (1e18 * blocksPerYear)`. APR rises with **utilization** = `outstanding / (idle cash + outstanding)`.
- **Repayment:** `repayLoan(agentId, maxPayment)` applies **interest first**, then principal. Pass **`maxPayment = 0`** to settle the **full** debt (principal + accrued interest).
- **Top-ups:** `drawMore(agentId, amount)` adds principal on an open line while still before `dueBlock`, subject to the **effective** tier cap.
- **Liquidation:** after `dueBlock`, anyone calls `liquidateOverdue` / `markDefault`. Principal + accrued interest are **written off** as bad debt, `AgentCreditScore.recordLiquidation` increments defaults and **slash score points**, and the pool applies **strikes**: each strike lowers max borrow **bps** until a **cooldown** elapses; after **`maxStrikesBeforeForever`** the agent is **frozen** from new borrows (`hasDefaulted` view). Owner tunes rates, duration, slash size, strike/cooldown rules via `setRateParams`, `setLoanDuration`, `setLiquidationParams`, etc.

Redeploy contracts (or point `deployments.json` at new addresses) after pulling these protocol changes; the Arc addresses in the table above are from an **older** deployment and will not expose the new ABI until upgraded on-chain.

## Why Arc?

- **Native USDC gas token**: No gas cost friction for micropayments — $0.005 x402 payments are economical at any scale
- **~1 second block times**: Agent interactions settle faster than a human could respond
- **EVM-compatible**: Full Solidity + viem + Hardhat toolchain works out of the box
- **Circle ecosystem**: Built for USDC-native agentic economies

## Architecture

```
contracts/          Hardhat 2, Solidity 0.8.24, OpenZeppelin 5.x
  AgentCreditScore.sol    — on-chain scoring engine
  MicroLendingPool.sol    — utilization-based borrow APR, accrual, partial repay, drawMore, liquidation/strikes
  IdentityRegistry.sol    — ERC-8004 agent NFTs
  ReputationRegistry.sol  — ERC-8004 reputation store
  ValidationRegistry.sol  — ERC-8004 validation proofs
  MockUSDC.sol            — ERC-20 for pool

agents/             TypeScript + tsx + viem
  DataAgent.ts        — x402 price feed server (port 3001) + /health, /metrics
  ComputeAgent.ts     — x402 ML inference server (port 3002) + /health, /metrics
  AnalystAgent.ts     — main loop: buy→borrow→use→repay; HTTP + WS on 3003 (/health, /metrics)
  LenderAgent.ts      — deposits USDC into pool on startup; HTTP 3005 (/health, /metrics)
  AuditorAgent.ts     — ERC-8004 feedback per iteration; HTTP 3006 (/health, /metrics)

dashboard/          Next.js 16 + Recharts + Tailwind
  app/api/scores/     — live credit scores from chain
  app/api/pool/       — pool stats from chain
  app/api/events/     — SSE bridge to AnalystAgent WebSocket
```

## Local config (no secrets in git)

Tracked templates live at the repo root:

- `deployments.example.json` — public Arc testnet addresses (same table as below).
- `agent-ids.example.json` — placeholder NFT ids for a **compile-only** clone; replace with real ids after `register-agents.ts`.

On `npm install` in `contracts/`, `agents/`, or `dashboard/`, `scripts/bootstrap-config.cjs` copies each `*.example.json` to `deployments.json` / `agent-ids.json` **only if those files are missing** (your real deploy output is never overwritten). You can also copy manually:

```bash
cp deployments.example.json deployments.json
cp agent-ids.example.json agent-ids.json
```

`deployments.json` and `agent-ids.json` stay gitignored so local deploys and registered ids are never committed. Private keys stay in `.env` (see `.env.example`).

## Running the Demo

```bash
# Install dependencies (also bootstraps deployments.json + agent-ids.json when absent)
cd contracts && npm install
cd ../agents && npm install
cd ../dashboard && npm install

# Deploy contracts (only needed once)
cd ../contracts && npx hardhat run scripts/deploy.js --network arcTestnet

# Register agent identities (only needed once)
cd ../agents && npx tsx src/scripts/register-agents.ts

# Run the full demo
cd ..
chmod +x scripts/start-demo.sh
./scripts/start-demo.sh
```

Open http://localhost:3004 to see the live dashboard (override with `DASHBOARD_PORT`).

### Demo / stress tuning (environment)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEMO_ITERATIONS` | `8` | AnalystAgent loop length |
| `DEMO_ITERATION_DELAY_MS` | `4000` | Pause between iterations |
| `DEMO_LOAN_AMOUNT_USDC` | `10` | Loan principal (must fit tier limit) |
| `DEMO_REPAY_ZERO_BASED_INDEX` | `iterations - 2` | Which iteration index repays (0-based) |
| `LENDER_DEPOSIT_USDC` | `200` | LenderAgent pool deposit |
| `DATA_AGENT_PORT` / `COMPUTE_AGENT_PORT` / `ANALYST_AGENT_PORT` | `3001`–`3003` | Seller + analyst WS/HTTP |
| `LENDER_AGENT_PORT` / `AUDITOR_AGENT_PORT` | `3005` / `3006` | Health + metrics HTTP |
| `DASHBOARD_PORT` | `3004` | Next dev server |
| `HEALTH_WAIT_TIMEOUT` | `120` | `start-demo.sh` readiness timeout (seconds) |

Each agent process exposes **GET `/health`**; sellers, lender, auditor, and analyst also expose **GET `/metrics`** (counters or pool snapshot). `scripts/start-demo.sh` waits on HTTP readiness instead of fixed sleeps.

## Contract tests

```bash
cd contracts && npm test
```

Hardhat covers `MicroLendingPool` and `AgentCreditScore` edge cases in `test/lending-and-credit.test.js`, plus the existing smoke path in `test/smoke.test.js`. **Forking Arc inside Hardhat’s default EVM is unreliable** (chain id / hardfork metadata); for a live read against testnet, point `cast` or a small viem script at `ARC_RPC_URL` and call `getPoolStats()` on the pool address above.

## Demo Results (Live Testnet)

From two successful demo runs:
- **50+ transactions** on Arc testnet
- AnalystAgent credit score: **150 → 602 (Tier B)**
- **2 loans issued**, 1 repaid on-time
- x402 micropayments: **24 payments** at $0.005 USDC each
- AuditorAgent: **16 on-chain reputation submissions**
- Pool state: 390 USDC balance, 2 issued, 1 repaid, 1 active

## Standards Used

- **ERC-8004**: Three-registry AI agent identity (Identity/Reputation/Validation)
- **x402**: HTTP 402 payment protocol for API micropayments
- **Circle Arc**: EVM L1 with native USDC gas token

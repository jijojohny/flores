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

| Tier | Score | Max Loan |
|---|---|---|
| A | ≥ 750 | 100 USDC |
| B | ≥ 500 | 50 USDC |
| C | ≥ 250 | 20 USDC |
| D | < 250 | — (no loans) |

## Why Arc?

- **Native USDC gas token**: No gas cost friction for micropayments — $0.005 x402 payments are economical at any scale
- **~1 second block times**: Agent interactions settle faster than a human could respond
- **EVM-compatible**: Full Solidity + viem + Hardhat toolchain works out of the box
- **Circle ecosystem**: Built for USDC-native agentic economies

## Architecture

```
contracts/          Hardhat 2, Solidity 0.8.24, OpenZeppelin 5.x
  AgentCreditScore.sol    — on-chain scoring engine
  MicroLendingPool.sol    — tier-gated USDC lending
  IdentityRegistry.sol    — ERC-8004 agent NFTs
  ReputationRegistry.sol  — ERC-8004 reputation store
  ValidationRegistry.sol  — ERC-8004 validation proofs
  MockUSDC.sol            — ERC-20 for pool

agents/             TypeScript + tsx + viem
  DataAgent.ts        — x402 price feed server (port 3001)
  ComputeAgent.ts     — x402 ML inference server (port 3002)
  AnalystAgent.ts     — main loop: buy→borrow→use→repay (WS on 3003)
  LenderAgent.ts      — deposits 200 USDC into pool on startup
  AuditorAgent.ts     — submits ERC-8004 feedback per iteration

dashboard/          Next.js 16 + Recharts + Tailwind
  app/api/scores/     — live credit scores from chain
  app/api/pool/       — pool stats from chain
  app/api/events/     — SSE bridge to AnalystAgent WebSocket
```

## Running the Demo

```bash
# Install dependencies
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

Open http://localhost:3004 to see the live dashboard.

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

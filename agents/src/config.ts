import { config as loadEnv } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "../../.env") });
import deploymentsRaw from "../../deployments.json" assert { type: "json" };
import type { Address } from "viem";

// ─── Chain ────────────────────────────────────────────────────
export const ARC_RPC_URL = process.env.ARC_RPC_URL!;

// ─── Wallets ──────────────────────────────────────────────────
export const DEPLOYER_PK         = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
export const DATA_AGENT_PK       = process.env.DATA_AGENT_PRIVATE_KEY as `0x${string}`;
export const COMPUTE_AGENT_PK    = process.env.COMPUTE_AGENT_PRIVATE_KEY as `0x${string}`;
export const ANALYST_AGENT_PK    = process.env.ANALYST_AGENT_PRIVATE_KEY as `0x${string}`;
export const LENDER_AGENT_PK     = process.env.LENDER_AGENT_PRIVATE_KEY as `0x${string}`;
export const AUDITOR_AGENT_PK    = process.env.AUDITOR_AGENT_PRIVATE_KEY as `0x${string}`;

// ─── Contract addresses ───────────────────────────────────────
export const deployments = deploymentsRaw as {
  identityRegistry:   string;
  reputationRegistry: string;
  validationRegistry: string;
  agentCreditScore:   string;
  mockUsdc:           string;
  microLendingPool:   string;
};

export const IDENTITY_REGISTRY   = deployments.identityRegistry   as Address;
export const REPUTATION_REGISTRY = deployments.reputationRegistry as Address;
export const VALIDATION_REGISTRY = deployments.validationRegistry as Address;
export const CREDIT_SCORE        = deployments.agentCreditScore   as Address;
export const MOCK_USDC           = deployments.mockUsdc           as Address;
export const LENDING_POOL        = deployments.microLendingPool   as Address;

// ─── Agent IDs (set after register-agents.ts runs) ───────────
export const AGENT_IDS = {
  data:     process.env.DATA_AGENT_ID     ? BigInt(process.env.DATA_AGENT_ID)     : undefined,
  compute:  process.env.COMPUTE_AGENT_ID  ? BigInt(process.env.COMPUTE_AGENT_ID)  : undefined,
  analyst:  process.env.ANALYST_AGENT_ID  ? BigInt(process.env.ANALYST_AGENT_ID)  : undefined,
  lender:   process.env.LENDER_AGENT_ID   ? BigInt(process.env.LENDER_AGENT_ID)   : undefined,
  auditor:  process.env.AUDITOR_AGENT_ID  ? BigInt(process.env.AUDITOR_AGENT_ID)  : undefined,
};

// ─── Ports ────────────────────────────────────────────────────
export const DATA_AGENT_PORT    = Number(process.env.DATA_AGENT_PORT    ?? 3001);
export const COMPUTE_AGENT_PORT = Number(process.env.COMPUTE_AGENT_PORT ?? 3002);
export const ANALYST_AGENT_PORT = Number(process.env.ANALYST_AGENT_PORT ?? 3003);

// ─── Arc Explorer ─────────────────────────────────────────────
export const EXPLORER = "https://testnet.arcscan.app";
export const explorerTx   = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddr = (addr: string) => `${EXPLORER}/address/${addr}`;

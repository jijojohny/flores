import { config as loadEnv } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import type { Address } from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");
loadEnv({ path: join(REPO_ROOT, ".env") });

function readRepoJson(primary: string, fallback: string): unknown {
  const primaryPath = join(REPO_ROOT, primary);
  const p = existsSync(primaryPath) ? primaryPath : join(REPO_ROOT, fallback);
  return JSON.parse(readFileSync(p, "utf8"));
}

const deploymentsRaw = readRepoJson("deployments.json", "deployments.example.json") as {
  identityRegistry: string;
  reputationRegistry: string;
  validationRegistry: string;
  agentCreditScore: string;
  mockUsdc: string;
  microLendingPool: string;
};

const agentIdsFile = readRepoJson("agent-ids.json", "agent-ids.example.json") as Record<string, string>;

// ─── Chain ────────────────────────────────────────────────────
export const ARC_RPC_URL = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";

// ─── Wallets ──────────────────────────────────────────────────
export const DEPLOYER_PK         = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
export const DATA_AGENT_PK       = process.env.DATA_AGENT_PRIVATE_KEY as `0x${string}`;
export const COMPUTE_AGENT_PK    = process.env.COMPUTE_AGENT_PRIVATE_KEY as `0x${string}`;
export const ANALYST_AGENT_PK    = process.env.ANALYST_AGENT_PRIVATE_KEY as `0x${string}`;
export const LENDER_AGENT_PK     = process.env.LENDER_AGENT_PRIVATE_KEY as `0x${string}`;
export const AUDITOR_AGENT_PK    = process.env.AUDITOR_AGENT_PRIVATE_KEY as `0x${string}`;

// ─── Contract addresses ───────────────────────────────────────
export const deployments = deploymentsRaw;

export const IDENTITY_REGISTRY   = deployments.identityRegistry   as Address;
export const REPUTATION_REGISTRY = deployments.reputationRegistry as Address;
export const VALIDATION_REGISTRY = deployments.validationRegistry as Address;
export const CREDIT_SCORE        = deployments.agentCreditScore   as Address;
export const MOCK_USDC           = deployments.mockUsdc           as Address;
export const LENDING_POOL        = deployments.microLendingPool   as Address;

function idFromEnvOrFile(envVal: string | undefined, fileKey: string): bigint | undefined {
  if (envVal !== undefined && envVal !== "") return BigInt(envVal);
  const v = agentIdsFile[fileKey];
  if (v === undefined || v === "") return undefined;
  return BigInt(v);
}

// ─── Agent IDs (env overrides agent-ids.json) ─────────────────
export const AGENT_IDS = {
  data:    idFromEnvOrFile(process.env.DATA_AGENT_ID,    "DataAgent"),
  compute: idFromEnvOrFile(process.env.COMPUTE_AGENT_ID, "ComputeAgent"),
  analyst: idFromEnvOrFile(process.env.ANALYST_AGENT_ID, "AnalystAgent"),
  lender:  idFromEnvOrFile(process.env.LENDER_AGENT_ID,  "LenderAgent"),
  auditor: idFromEnvOrFile(process.env.AUDITOR_AGENT_ID, "AuditorAgent"),
};

// ─── Ports ────────────────────────────────────────────────────
export const DATA_AGENT_PORT     = Number(process.env.DATA_AGENT_PORT     ?? 3001);
export const COMPUTE_AGENT_PORT  = Number(process.env.COMPUTE_AGENT_PORT  ?? 3002);
export const ANALYST_AGENT_PORT  = Number(process.env.ANALYST_AGENT_PORT  ?? 3003);
export const LENDER_AGENT_PORT   = Number(process.env.LENDER_AGENT_PORT   ?? 3005);
export const AUDITOR_AGENT_PORT  = Number(process.env.AUDITOR_AGENT_PORT  ?? 3006);

// ─── Demo tuning (AnalystAgent + scripts) ─────────────────────
export const DEMO_ITERATIONS = Math.max(1, Number(process.env.DEMO_ITERATIONS ?? 8));
export const DEMO_ITERATION_DELAY_MS = Math.max(0, Number(process.env.DEMO_ITERATION_DELAY_MS ?? 4_000));
/** USDC principal string, e.g. "10" */
export const DEMO_LOAN_AMOUNT_USDC = process.env.DEMO_LOAN_AMOUNT_USDC ?? "10";
/** Zero-based iteration index at which to repay (default: second-to-last). */
export const DEMO_REPAY_ZERO_BASED_INDEX = (() => {
  const raw = process.env.DEMO_REPAY_ZERO_BASED_INDEX;
  if (raw === undefined || raw === "") return Math.max(0, DEMO_ITERATIONS - 2);
  return Math.max(0, Math.min(DEMO_ITERATIONS - 1, Number(raw)));
})();
/** Lender deposit size in USDC (whole units). */
export const LENDER_DEPOSIT_USDC = process.env.LENDER_DEPOSIT_USDC ?? "200";

// ─── Arc Explorer ─────────────────────────────────────────────
export const EXPLORER = "https://testnet.arcscan.app";
export const explorerTx   = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddr = (addr: string) => `${EXPLORER}/address/${addr}`;

/**
 * One-shot script: register all 5 agents in IdentityRegistry, write agentIds to agent-ids.json.
 * Run once after deployment: npx tsx src/scripts/register-agents.ts
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { identityRegistryAbi } from "../shared/contracts.js";
import { publicClient, dataWallet, computeWallet, analystWallet, lenderWallet, auditorWallet, DATA_ADDR, COMPUTE_ADDR, ANALYST_ADDR, LENDER_ADDR, AUDITOR_ADDR } from "../chain.js";
import {
  IDENTITY_REGISTRY, explorerTx,
  DATA_AGENT_PORT, COMPUTE_AGENT_PORT, ANALYST_AGENT_PORT,
} from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const agents = [
  {
    name: "DataAgent",
    wallet: dataWallet,
    address: DATA_ADDR,
    card: JSON.stringify({
      name: "DataAgent",
      description: "Sells real-time BTC/ETH price data via x402",
      capabilities: ["price-feed"],
      paymentAddress: DATA_ADDR,
      endpoints: [{ type: "http", url: `http://localhost:${DATA_AGENT_PORT}/price`, x402: true }],
    }),
  },
  {
    name: "ComputeAgent",
    wallet: computeWallet,
    address: COMPUTE_ADDR,
    card: JSON.stringify({
      name: "ComputeAgent",
      description: "Sells LLM inference via x402",
      capabilities: ["inference"],
      paymentAddress: COMPUTE_ADDR,
      endpoints: [{ type: "http", url: `http://localhost:${COMPUTE_AGENT_PORT}/infer`, x402: true }],
    }),
  },
  {
    name: "AnalystAgent",
    wallet: analystWallet,
    address: ANALYST_ADDR,
    card: JSON.stringify({
      name: "AnalystAgent",
      description: "Buys data + compute, produces reports, borrows from lending pool",
      capabilities: ["analysis", "borrow"],
      paymentAddress: ANALYST_ADDR,
    }),
  },
  {
    name: "LenderAgent",
    wallet: lenderWallet,
    address: LENDER_ADDR,
    card: JSON.stringify({
      name: "LenderAgent",
      description: "Deposits USDC into lending pool and monitors loan health",
      capabilities: ["lend"],
      paymentAddress: LENDER_ADDR,
    }),
  },
  {
    name: "AuditorAgent",
    wallet: auditorWallet,
    address: AUDITOR_ADDR,
    card: JSON.stringify({
      name: "AuditorAgent",
      description: "Validates task completion and submits ERC-8004 reputation feedback",
      capabilities: ["audit", "validate"],
      paymentAddress: AUDITOR_ADDR,
    }),
  },
];

const agentIds: Record<string, string> = {};

for (const agent of agents) {
  process.stdout.write(`Registering ${agent.name}... `);

  const hash = await agent.wallet.writeContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [`data:application/json,${agent.card}`],
    chain: agent.wallet.chain,
    account: agent.wallet.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // ERC-721 Transfer(from, to, tokenId) — all 3 params are indexed, so:
  // topics[0]=sig, topics[1]=from, topics[2]=to, topics[3]=tokenId
  // The Transfer event is always logs[0] from _safeMint
  const transferLog = receipt.logs[0];
  const agentId = transferLog?.topics[3]
    ? BigInt(transferLog.topics[3]).toString()
    : "unknown";

  agentIds[agent.name] = agentId;
  console.log(`agentId=${agentId} | ${explorerTx(hash)}`);
}

// Write to agent-ids.json at repo root
const outPath = join(__dirname, "../../../agent-ids.json");
writeFileSync(outPath, JSON.stringify(agentIds, null, 2));
console.log("\nagent-ids.json written:");
console.log(agentIds);
console.log("\nAdd these to .env:");
console.log(`DATA_AGENT_ID=${agentIds["DataAgent"]}`);
console.log(`COMPUTE_AGENT_ID=${agentIds["ComputeAgent"]}`);
console.log(`ANALYST_AGENT_ID=${agentIds["AnalystAgent"]}`);
console.log(`LENDER_AGENT_ID=${agentIds["LenderAgent"]}`);
console.log(`AUDITOR_AGENT_ID=${agentIds["AuditorAgent"]}`);

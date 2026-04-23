/**
 * ComputeAgent — sells mock LLM inference via x402 for 0.008 USDC/call.
 * After each paid request, records the buyer's transaction on-chain.
 */
import "dotenv/config";
import express from "express";
import { parseEther } from "viem";
import { requirePayment } from "../shared/x402Verify.js";
import { deployerWallet } from "../chain.js";
import { creditScoreAbi } from "../shared/contracts.js";
import { CREDIT_SCORE, COMPUTE_AGENT_PORT, AGENT_IDS, explorerTx } from "../config.js";
import { COMPUTE_ADDR } from "../chain.js";

const INFERENCE_PRICE_WEI = parseEther("0.008");

// Pre-written analysis sentences rotated for variety
const ANALYSIS_TEMPLATES = [
  "BTC shows strong support at current levels with bullish divergence on the 4H RSI.",
  "ETH/BTC ratio trending upward — capital rotation into ETH ecosystem observed.",
  "On-chain data suggests accumulation phase: exchange outflows exceeding inflows.",
  "Funding rates normalized after recent correction — market structure remains intact.",
  "Derivatives open interest elevated: potential for high-volatility move in either direction.",
  "Spot demand strong relative to futures premium — contango structure healthy.",
  "Social sentiment index at 68/100, historically correlated with consolidation periods.",
  "Miner revenue stabilizing post-halving: hash rate at all-time high despite reward reduction.",
];

let templateIndex = 0;
let paidInferencesServed = 0;

function generateAnalysis(prompt: string): string {
  const template = ANALYSIS_TEMPLATES[templateIndex % ANALYSIS_TEMPLATES.length];
  templateIndex++;
  return `[${new Date().toISOString()}] ${template} (prompt: "${prompt.slice(0, 60)}...")`;
}

async function recordBuyerTransaction(amountWei: bigint) {
  const analystId = AGENT_IDS.analyst;
  if (!analystId) return;
  try {
    const hash = await deployerWallet.writeContract({
      address: CREDIT_SCORE,
      abi: creditScoreAbi,
      functionName: "recordTransaction",
      args: [analystId, amountWei],
      chain: deployerWallet.chain,
      account: deployerWallet.account!,
    });
    console.log(`  [credit] Recorded tx for AnalystAgent: ${explorerTx(hash)}`);
  } catch (e: any) {
    console.warn("  [credit] Failed:", e.message);
  }
}

const app = express();
app.use(express.json());

app.post("/infer", requirePayment(COMPUTE_ADDR, INFERENCE_PRICE_WEI), async (req, res) => {
  const prompt = (req.body?.prompt as string) ?? "Analyze market conditions";
  const result = generateAnalysis(prompt);

  res.json({ result, model: "mock-llm-v1", timestamp: Date.now() });
  paidInferencesServed++;
  console.log(`  [compute] Inference served to ${(req as any).payerAddress}`);

  recordBuyerTransaction(INFERENCE_PRICE_WEI);
});

app.get("/health", (_req, res) => res.json({ status: "ok", agent: "ComputeAgent" }));

app.get("/metrics", (_req, res) => {
  res.json({ agent: "ComputeAgent", paidInferencesServed, priceWei: INFERENCE_PRICE_WEI.toString() });
});

app.listen(COMPUTE_AGENT_PORT, () => {
  console.log(`ComputeAgent listening on :${COMPUTE_AGENT_PORT}`);
  console.log(`  Address: ${COMPUTE_ADDR}`);
  console.log(`  Price per inference: 0.008 USDC`);
});

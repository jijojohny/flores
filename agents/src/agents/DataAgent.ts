/**
 * DataAgent — sells BTC/ETH price data via x402 for 0.005 USDC/query.
 * After each paid request, records the buyer's (AnalystAgent's) transaction on-chain.
 */
import "dotenv/config";
import express from "express";
import { parseEther } from "viem";
import { requirePayment } from "../shared/x402Verify.js";
import { publicClient, deployerWallet } from "../chain.js";
import { creditScoreAbi } from "../shared/contracts.js";
import { CREDIT_SCORE, DATA_AGENT_PORT, AGENT_IDS, explorerTx } from "../config.js";
import { DATA_ADDR } from "../chain.js";

const PRICE_WEI = parseEther("0.005"); // 0.005 USDC per query

let paidQueriesServed = 0;

// ─── Price cache (30s TTL) ────────────────────────────────────
let priceCache: { btc: number; eth: number; updatedAt: number } | null = null;

async function fetchPrices() {
  if (priceCache && Date.now() - priceCache.updatedAt < 30_000) return priceCache;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd"
    );
    const data = await res.json() as any;
    priceCache = { btc: data.bitcoin.usd, eth: data.ethereum.usd, updatedAt: Date.now() };
  } catch {
    // Fallback prices if CoinGecko is rate-limited
    priceCache = { btc: 95000, eth: 3200, updatedAt: Date.now() };
  }
  return priceCache!;
}

// ─── Record buyer's transaction on AgentCreditScore ──────────
async function recordBuyerTransaction(payerAddr: `0x${string}`, amountWei: bigint) {
  const analystId = AGENT_IDS.analyst;
  if (!analystId) return; // agentIds not set yet — skip recording

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
    console.warn("  [credit] Failed to record transaction:", e.message);
  }
}

// ─── Express server ───────────────────────────────────────────
const app = express();
app.use(express.json());

app.get("/price", requirePayment(DATA_ADDR, PRICE_WEI), async (req, res) => {
  const asset = (req.query.asset as string ?? "BTC").toUpperCase();
  const prices = await fetchPrices();
  const price = asset === "ETH" ? prices.eth : prices.btc;

  const payload = { asset, price, currency: "USD", timestamp: Date.now() };
  res.json(payload);
  paidQueriesServed++;
  console.log(`  [data] Served ${asset} price $${price} to ${(req as any).payerAddress}`);

  // Fire-and-forget: record on credit score contract
  recordBuyerTransaction((req as any).payerAddress, PRICE_WEI);
});

app.get("/health", (_req, res) => res.json({ status: "ok", agent: "DataAgent" }));

app.get("/metrics", (_req, res) => {
  res.json({ agent: "DataAgent", paidQueriesServed, priceWei: PRICE_WEI.toString() });
});

app.listen(DATA_AGENT_PORT, () => {
  console.log(`DataAgent listening on :${DATA_AGENT_PORT}`);
  console.log(`  Address: ${DATA_ADDR}`);
  console.log(`  Price per query: 0.005 USDC`);
});

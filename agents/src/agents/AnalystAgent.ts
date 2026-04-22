/**
 * AnalystAgent — the transaction engine.
 * Runs 8 iterations: buys data + compute via x402, borrows at iter 4, repays at iter 7.
 * Broadcasts each report over WebSocket so the dashboard updates live.
 */
import "dotenv/config";
import { parseEther, formatEther } from "viem";
import { WebSocketServer } from "ws";
import { publicClient, analystWallet } from "../chain.js";
import { mockUsdcAbi, lendingPoolAbi, creditScoreAbi } from "../shared/contracts.js";
import { x402Fetch } from "../shared/x402Client.js";
import {
  MOCK_USDC, LENDING_POOL, CREDIT_SCORE, AGENT_IDS, ANALYST_AGENT_PORT,
  DATA_AGENT_PORT, COMPUTE_AGENT_PORT, explorerTx,
} from "../config.js";
import { ANALYST_ADDR } from "../chain.js";

const LOAN_AMOUNT  = parseEther("10"); // 10 USDC
const TOTAL_ITERS  = 8;
const ITER_DELAY   = 4_000; // ms between iterations

// ─── WebSocket broadcast ──────────────────────────────────────
const wss = new WebSocketServer({ port: ANALYST_AGENT_PORT });
const clients = new Set<any>();
wss.on("connection", (ws) => { clients.add(ws); ws.on("close", () => clients.delete(ws)); });

function broadcast(event: string, data: unknown) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

// ─── Main loop ────────────────────────────────────────────────
async function run() {
  console.log("AnalystAgent starting...");
  console.log(`  Address: ${ANALYST_ADDR}`);
  console.log(`  WS broadcast on :${ANALYST_AGENT_PORT}`);

  const analystId = AGENT_IDS.analyst;
  if (!analystId) {
    console.warn("ANALYST_AGENT_ID not set — run register-agents.ts first. Proceeding without ID.");
  }

  let hasActiveLoan = false;

  for (let i = 0; i < TOTAL_ITERS; i++) {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`Iteration ${i + 1}/${TOTAL_ITERS}`);

    // ── Step 1: Check tier each iteration and borrow when eligible ───
    if (!hasActiveLoan && analystId) {
      try {
        const [currentTier, score] = await Promise.all([
          publicClient.readContract({ address: CREDIT_SCORE, abi: creditScoreAbi, functionName: "getTier",         args: [analystId] }),
          publicClient.readContract({ address: CREDIT_SCORE, abi: creditScoreAbi, functionName: "getCreditScore", args: [analystId] }),
        ]);
        console.log(`  Credit score: ${score} | Tier: ${currentTier}`);

        if (["A", "B", "C"].includes(currentTier as string)) {
          console.log("Tier eligible — requesting loan of 10 USDC from lending pool...");
          const hash = await analystWallet.writeContract({
            address: LENDING_POOL, abi: lendingPoolAbi, functionName: "requestLoan",
            args: [analystId, LOAN_AMOUNT],
            chain: analystWallet.chain, account: analystWallet.account!,
          });
          await publicClient.waitForTransactionReceipt({ hash });
          hasActiveLoan = true;
          console.log(`  Loan issued: ${explorerTx(hash)}`);
          broadcast("loan_issued", { agentId: analystId.toString(), amount: "10", hash, tier: currentTier });
        } else {
          console.log(`  Tier D (score=${score}) — building history, will retry next iteration`);
        }
      } catch (e: any) {
        const msg = (e.message ?? "").split("\n")[0];
        if (msg.includes("Active loan already exists")) {
          hasActiveLoan = true; // sync state from chain
          console.log("  Active loan detected on-chain — syncing state");
        } else {
          console.warn("  Loan check error:", msg);
        }
      }
    }

    // ── Step 2: Buy BTC price from DataAgent ──────────────────────────
    console.log("Buying BTC price from DataAgent...");
    let btcPrice: any = { price: 95000 };
    try {
      const res = await x402Fetch(
        `http://localhost:${DATA_AGENT_PORT}/price?asset=BTC`, {}, analystWallet
      );
      if (res.ok) btcPrice = await res.json();
    } catch (e: any) {
      console.warn("  DataAgent error:", e.message);
    }

    // ── Step 3: Buy ETH price from DataAgent ──────────────────────────
    console.log("Buying ETH price from DataAgent...");
    let ethPrice: any = { price: 3200 };
    try {
      const res = await x402Fetch(
        `http://localhost:${DATA_AGENT_PORT}/price?asset=ETH`, {}, analystWallet
      );
      if (res.ok) ethPrice = await res.json();
    } catch (e: any) {
      console.warn("  DataAgent error:", e.message);
    }

    // ── Step 4: Buy inference from ComputeAgent ────────────────────────
    console.log("Buying inference from ComputeAgent...");
    let analysis: any = { result: "Market analysis unavailable" };
    try {
      const res = await x402Fetch(
        `http://localhost:${COMPUTE_AGENT_PORT}/infer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: `BTC=${btcPrice.price} ETH=${ethPrice.price}` }),
        },
        analystWallet,
      );
      if (res.ok) analysis = await res.json();
    } catch (e: any) {
      console.warn("  ComputeAgent error:", e.message);
    }

    // ── Step 5: Compile and broadcast report ──────────────────────────
    const report = {
      iteration: i + 1,
      btcPrice:  btcPrice.price,
      ethPrice:  ethPrice.price,
      analysis:  analysis.result,
      timestamp: Date.now(),
    };
    console.log(`Report: BTC=$${report.btcPrice}, ETH=$${report.ethPrice}`);
    broadcast("report", report);

    // ── Step 6: Repay loan on second-to-last iteration ───────────────
    if (i === TOTAL_ITERS - 2 && hasActiveLoan && analystId) {
      try {
        console.log("Repaying loan...");
        // Approve first
        const approveTx = await analystWallet.writeContract({
          address: MOCK_USDC, abi: mockUsdcAbi, functionName: "approve",
          args: [LENDING_POOL, LOAN_AMOUNT],
          chain: analystWallet.chain, account: analystWallet.account!,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        const repayTx = await analystWallet.writeContract({
          address: LENDING_POOL, abi: lendingPoolAbi, functionName: "repayLoan",
          args: [analystId],
          chain: analystWallet.chain, account: analystWallet.account!,
        });
        await publicClient.waitForTransactionReceipt({ hash: repayTx });
        hasActiveLoan = false;
        console.log(`  Loan repaid: ${explorerTx(repayTx)}`);
        broadcast("loan_repaid", { agentId: analystId.toString(), hash: repayTx });
      } catch (e: any) {
        console.warn("  Repayment failed:", e.message);
      }
    }

    if (i < TOTAL_ITERS - 1) {
      console.log(`Waiting ${ITER_DELAY / 1000}s before next iteration...`);
      await new Promise((r) => setTimeout(r, ITER_DELAY));
    }
  }

  console.log("\nAnalystAgent: all iterations complete.");
  broadcast("done", { totalIterations: TOTAL_ITERS });
}

run().catch(console.error);

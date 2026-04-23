/**
 * AnalystAgent — the transaction engine.
 * Buys data + compute via x402, may borrow from the pool when tier allows, repays on a configurable iteration.
 * HTTP + WebSocket on ANALYST_AGENT_PORT: GET /health, GET /metrics, WS for live dashboard events.
 */
import "dotenv/config";
import { createServer } from "http";
import { parseEther, formatEther, maxUint256 } from "viem";
import { WebSocketServer } from "ws";
import { publicClient, analystWallet } from "../chain.js";
import { mockUsdcAbi, lendingPoolAbi, creditScoreAbi } from "../shared/contracts.js";
import { x402Fetch } from "../shared/x402Client.js";
import {
  MOCK_USDC, LENDING_POOL, CREDIT_SCORE, AGENT_IDS, ANALYST_AGENT_PORT,
  DATA_AGENT_PORT, COMPUTE_AGENT_PORT, explorerTx,
  DEMO_ITERATIONS, DEMO_ITERATION_DELAY_MS, DEMO_LOAN_AMOUNT_USDC, DEMO_REPAY_ZERO_BASED_INDEX,
} from "../config.js";
import { ANALYST_ADDR } from "../chain.js";

const LOAN_AMOUNT = parseEther(DEMO_LOAN_AMOUNT_USDC);

const clients = new Set<import("ws").WebSocket>();
let currentIteration = 0;

const server = createServer((req, res) => {
  const pathOnly = req.url?.split("?")[0] ?? "";
  if (pathOnly === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      agent: "AnalystAgent",
      wsClients: clients.size,
      iteration: currentIteration,
      totalIterations: DEMO_ITERATIONS,
    }));
    return;
  }
  if (pathOnly === "/metrics") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      agent: "AnalystAgent",
      wsClients: clients.size,
      iteration: currentIteration,
      totalIterations: DEMO_ITERATIONS,
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

function broadcast(event: string, data: unknown) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

async function run() {
  console.log("AnalystAgent starting...");
  console.log(`  Address: ${ANALYST_ADDR}`);
  console.log(`  Iterations: ${DEMO_ITERATIONS}, delay: ${DEMO_ITERATION_DELAY_MS}ms, loan: ${formatEther(LOAN_AMOUNT)} USDC, repay at index: ${DEMO_REPAY_ZERO_BASED_INDEX}`);
  console.log(`  HTTP + WS on :${ANALYST_AGENT_PORT}`);

  const analystId = AGENT_IDS.analyst;
  if (!analystId) {
    console.warn("ANALYST_AGENT_ID not set — run register-agents.ts first. Proceeding without ID.");
  }

  let hasActiveLoan = false;

  for (let i = 0; i < DEMO_ITERATIONS; i++) {
    currentIteration = i + 1;
    console.log(`\n${"─".repeat(50)}`);
    console.log(`Iteration ${i + 1}/${DEMO_ITERATIONS}`);

    if (!hasActiveLoan && analystId) {
      try {
        const [currentTier, score] = await Promise.all([
          publicClient.readContract({ address: CREDIT_SCORE, abi: creditScoreAbi, functionName: "getTier", args: [analystId] }),
          publicClient.readContract({ address: CREDIT_SCORE, abi: creditScoreAbi, functionName: "getCreditScore", args: [analystId] }),
        ]);
        console.log(`  Credit score: ${score} | Tier: ${currentTier}`);

        if (["A", "B", "C"].includes(currentTier as string)) {
          console.log(`Tier eligible — requesting loan of ${formatEther(LOAN_AMOUNT)} USDC from lending pool...`);
          const hash = await analystWallet.writeContract({
            address: LENDING_POOL, abi: lendingPoolAbi, functionName: "requestLoan",
            args: [analystId, LOAN_AMOUNT],
            chain: analystWallet.chain, account: analystWallet.account!,
          });
          await publicClient.waitForTransactionReceipt({ hash });
          hasActiveLoan = true;
          console.log(`  Loan issued: ${explorerTx(hash)}`);
          broadcast("loan_issued", { agentId: analystId.toString(), amount: formatEther(LOAN_AMOUNT), hash, tier: currentTier });
        } else {
          console.log(`  Tier D (score=${score}) — building history, will retry next iteration`);
        }
      } catch (e: any) {
        const msg = (e.message ?? "").split("\n")[0];
        if (msg.includes("Active loan already exists")) {
          hasActiveLoan = true;
          console.log("  Active loan detected on-chain — syncing state");
        } else {
          console.warn("  Loan check error:", msg);
        }
      }
    }

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

    const report = {
      iteration: i + 1,
      btcPrice: btcPrice.price,
      ethPrice: ethPrice.price,
      analysis: analysis.result,
      timestamp: Date.now(),
    };
    console.log(`Report: BTC=$${report.btcPrice}, ETH=$${report.ethPrice}`);
    broadcast("report", report);

    if (i === DEMO_REPAY_ZERO_BASED_INDEX && hasActiveLoan && analystId) {
      try {
        const [, , totalDue] = await publicClient.readContract({
          address: LENDING_POOL, abi: lendingPoolAbi, functionName: "totalDebt", args: [analystId],
        });
        console.log(`Repaying loan (principal + accrued interest ≈ ${formatEther(totalDue)} USDC)...`);
        const approveTx = await analystWallet.writeContract({
          address: MOCK_USDC, abi: mockUsdcAbi, functionName: "approve",
          args: [LENDING_POOL, maxUint256],
          chain: analystWallet.chain, account: analystWallet.account!,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        const repayTx = await analystWallet.writeContract({
          address: LENDING_POOL, abi: lendingPoolAbi, functionName: "repayLoan",
          args: [analystId, 0n],
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

    if (i < DEMO_ITERATIONS - 1) {
      console.log(`Waiting ${DEMO_ITERATION_DELAY_MS / 1000}s before next iteration...`);
      await new Promise((r) => setTimeout(r, DEMO_ITERATION_DELAY_MS));
    }
  }

  console.log("\nAnalystAgent: all iterations complete.");
  broadcast("done", { totalIterations: DEMO_ITERATIONS });
}

server.listen(ANALYST_AGENT_PORT, () => {
  console.log(`AnalystAgent listening on :${ANALYST_AGENT_PORT} (HTTP /health + WS)`);
  run().catch(console.error);
});

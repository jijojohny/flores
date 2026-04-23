/**
 * AuditorAgent — connects to AnalystAgent's WebSocket and submits ERC-8004
 * reputation feedback + validation proof after each report.
 * HTTP: GET /health, GET /metrics (WS connection + audit count).
 */
import "dotenv/config";
import express from "express";
import { keccak256, toBytes } from "viem";
import WebSocket from "ws";
import { publicClient, auditorWallet } from "../chain.js";
import { reputationRegistryAbi, validationRegistryAbi } from "../shared/contracts.js";
import {
  REPUTATION_REGISTRY, VALIDATION_REGISTRY,
  AGENT_IDS, ANALYST_AGENT_PORT, AUDITOR_AGENT_PORT, explorerTx,
} from "../config.js";
import { AUDITOR_ADDR } from "../chain.js";

let wsConnected = false;
let reportsAudited = 0;

const app = express();
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "AuditorAgent",
    wsConnected,
    reportsAudited,
  });
});
app.get("/metrics", (_req, res) => {
  res.json({ agent: "AuditorAgent", wsConnected, reportsAudited });
});

app.listen(AUDITOR_AGENT_PORT, () => {
  console.log(`AuditorAgent HTTP on :${AUDITOR_AGENT_PORT} (/health, /metrics)`);
});

async function submitFeedback(analystId: bigint, taskId: bigint, report: any) {
  const feedbackURI = `data:application/json,${JSON.stringify({ iteration: Number(taskId), passed: true })}`;
  const feedbackHash = keccak256(toBytes(JSON.stringify(report)));

  const hash = await auditorWallet.writeContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [
      analystId,
      85n,
      0,
      "credit",
      "payment",
      `http://localhost:${ANALYST_AGENT_PORT}`,
      feedbackURI,
      feedbackHash,
    ],
    chain: auditorWallet.chain,
    account: auditorWallet.account!,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  [audit] Feedback submitted: ${explorerTx(hash)}`);
  return hash;
}

async function submitValidation(analystId: bigint, taskId: bigint, report: any) {
  const proofURI = `data:application/json,${JSON.stringify({ passed: true, iteration: Number(taskId), btcPrice: report.btcPrice })}`;

  const hash = await auditorWallet.writeContract({
    address: VALIDATION_REGISTRY,
    abi: validationRegistryAbi,
    functionName: "submitValidation",
    args: [analystId, taskId, true, proofURI],
    chain: auditorWallet.chain,
    account: auditorWallet.account!,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  [audit] Validation submitted: ${explorerTx(hash)}`);
  return hash;
}

function connect() {
  const analystId = AGENT_IDS.analyst;
  if (!analystId) {
    console.warn("ANALYST_AGENT_ID not set — retrying in 5s...");
    setTimeout(connect, 5_000);
    return;
  }

  console.log("AuditorAgent connecting to AnalystAgent WebSocket...");
  const ws = new WebSocket(`ws://localhost:${ANALYST_AGENT_PORT}`);

  ws.on("open", () => {
    wsConnected = true;
    console.log(`AuditorAgent: connected. Watching for reports from AnalystAgent (${AUDITOR_ADDR})`);
  });

  const processedIterations = new Set<number>();

  ws.on("message", async (raw) => {
    try {
      const { event, data } = JSON.parse(raw.toString());
      if (event !== "report") return;

      if (processedIterations.has(data.iteration)) return;
      processedIterations.add(data.iteration);

      const taskId = BigInt(data.iteration);
      console.log(`\n[audit] Processing report for iteration ${data.iteration}...`);

      await submitFeedback(analystId, taskId, data);
      await submitValidation(analystId, taskId, data);
      reportsAudited++;
    } catch (e: any) {
      console.warn("[audit] Error processing report:", e.message);
    }
  });

  ws.on("close", () => {
    wsConnected = false;
    console.log("AuditorAgent: WebSocket closed. Reconnecting in 3s...");
    setTimeout(connect, 3_000);
  });

  ws.on("error", () => {
    wsConnected = false;
    console.warn("AuditorAgent: WS error (will reconnect on close)");
  });
}

console.log("AuditorAgent starting...");
connect();

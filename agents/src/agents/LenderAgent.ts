/**
 * LenderAgent — deposits MockUSDC into MicroLendingPool on startup, then monitors pool health.
 * HTTP: GET /health (ready after deposit), GET /metrics (pool stats when ready).
 */
import "dotenv/config";
import express from "express";
import { parseEther, formatEther } from "viem";
import { publicClient, lenderWallet } from "../chain.js";
import { mockUsdcAbi, lendingPoolAbi } from "../shared/contracts.js";
import { MOCK_USDC, LENDING_POOL, explorerTx, LENDER_AGENT_PORT, LENDER_DEPOSIT_USDC } from "../config.js";
import { LENDER_ADDR } from "../chain.js";

const DEPOSIT_AMOUNT = parseEther(LENDER_DEPOSIT_USDC);

let lenderReady = false;

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: lenderReady ? "ok" : "starting", agent: "LenderAgent" });
});

app.get("/metrics", async (_req, res) => {
  if (!lenderReady) {
    res.json({ agent: "LenderAgent", ready: false });
    return;
  }
  try {
    const [balance, issued, repaid, active] = await publicClient.readContract({
      address: LENDING_POOL, abi: lendingPoolAbi, functionName: "getPoolStats",
    });
    res.json({
      agent: "LenderAgent",
      ready: true,
      pool: {
        balance: formatEther(balance),
        totalLoansIssued: issued.toString(),
        totalLoansRepaid: repaid.toString(),
        totalActiveLoans: active.toString(),
      },
    });
  } catch (e: any) {
    res.status(500).json({ agent: "LenderAgent", error: e.message });
  }
});

app.listen(LENDER_AGENT_PORT, () => {
  console.log(`LenderAgent HTTP on :${LENDER_AGENT_PORT} (/health, /metrics)`);
});

async function fund() {
  console.log("LenderAgent starting...");
  console.log(`  Address: ${LENDER_ADDR}`);
  console.log(`  Deposit: ${LENDER_DEPOSIT_USDC} USDC`);

  const balance = await publicClient.readContract({
    address: MOCK_USDC, abi: mockUsdcAbi, functionName: "balanceOf", args: [LENDER_ADDR],
  });
  console.log(`  MockUSDC balance: ${formatEther(balance)} USDC`);

  console.log("Approving lending pool...");
  const approveTx = await lenderWallet.writeContract({
    address: MOCK_USDC, abi: mockUsdcAbi, functionName: "approve",
    args: [LENDING_POOL, DEPOSIT_AMOUNT],
    chain: lenderWallet.chain, account: lenderWallet.account!,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log(`  Approved: ${explorerTx(approveTx)}`);

  console.log("Depositing into lending pool...");
  const depositTx = await lenderWallet.writeContract({
    address: LENDING_POOL, abi: lendingPoolAbi, functionName: "deposit",
    args: [DEPOSIT_AMOUNT],
    chain: lenderWallet.chain, account: lenderWallet.account!,
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  console.log(`  Deposited: ${explorerTx(depositTx)}`);
  console.log("LenderAgent: pool funded. Monitoring...\n");

  lenderReady = true;

  setInterval(async () => {
    try {
      const [b, issued, repaid, active] = await publicClient.readContract({
        address: LENDING_POOL, abi: lendingPoolAbi, functionName: "getPoolStats",
      });
      console.log(
        `[pool] balance=${formatEther(b)} USDC | issued=${issued} | repaid=${repaid} | active=${active}`
      );
    } catch (e: any) {
      console.warn("[pool] Stats read failed:", e.message);
    }
  }, 30_000);
}

fund().catch(console.error);

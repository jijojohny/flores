import "dotenv/config";
import { parseEther, formatEther } from "viem";
import { publicClient, analystWallet } from "../chain.js";
import { mockUsdcAbi, lendingPoolAbi } from "../shared/contracts.js";
import { MOCK_USDC, LENDING_POOL, AGENT_IDS, explorerTx } from "../config.js";

async function run() {
  const analystId = AGENT_IDS.analyst;
  if (!analystId) throw new Error("ANALYST_AGENT_ID not set");

  const [balance, issued, repaid, active] = await publicClient.readContract({
    address: LENDING_POOL, abi: lendingPoolAbi, functionName: "getPoolStats",
  });
  console.log(`Pool: balance=${formatEther(balance)} issued=${issued} repaid=${repaid} active=${active}`);

  if (active === 0n) {
    console.log("No active loans. Nothing to repay.");
    return;
  }

  console.log("Approving USDC for repayment...");
  const approveTx = await analystWallet.writeContract({
    address: MOCK_USDC, abi: mockUsdcAbi, functionName: "approve",
    args: [LENDING_POOL, parseEther("100")],
    chain: analystWallet.chain, account: analystWallet.account!,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log(`  Approved: ${explorerTx(approveTx)}`);

  console.log("Repaying loan...");
  const repayTx = await analystWallet.writeContract({
    address: LENDING_POOL, abi: lendingPoolAbi, functionName: "repayLoan",
    args: [analystId],
    chain: analystWallet.chain, account: analystWallet.account!,
  });
  await publicClient.waitForTransactionReceipt({ hash: repayTx });
  console.log(`  Repaid: ${explorerTx(repayTx)}`);
}

run().catch(console.error);

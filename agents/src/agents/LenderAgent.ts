/**
 * LenderAgent — deposits 200 MockUSDC into MicroLendingPool on startup, then monitors pool health.
 */
import "dotenv/config";
import { parseEther, formatEther } from "viem";
import { publicClient, lenderWallet } from "../chain.js";
import { mockUsdcAbi, lendingPoolAbi } from "../shared/contracts.js";
import { MOCK_USDC, LENDING_POOL, explorerTx } from "../config.js";
import { LENDER_ADDR } from "../chain.js";

const DEPOSIT_AMOUNT = parseEther("200"); // 200 USDC

async function run() {
  console.log("LenderAgent starting...");
  console.log(`  Address: ${LENDER_ADDR}`);

  // Check balance
  const balance = await publicClient.readContract({
    address: MOCK_USDC, abi: mockUsdcAbi, functionName: "balanceOf", args: [LENDER_ADDR],
  });
  console.log(`  MockUSDC balance: ${formatEther(balance)} USDC`);

  // Approve lending pool
  console.log("Approving lending pool to spend 200 USDC...");
  const approveTx = await lenderWallet.writeContract({
    address: MOCK_USDC, abi: mockUsdcAbi, functionName: "approve",
    args: [LENDING_POOL, DEPOSIT_AMOUNT],
    chain: lenderWallet.chain, account: lenderWallet.account!,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log(`  Approved: ${explorerTx(approveTx)}`);

  // Deposit into pool
  console.log("Depositing 200 USDC into lending pool...");
  const depositTx = await lenderWallet.writeContract({
    address: LENDING_POOL, abi: lendingPoolAbi, functionName: "deposit",
    args: [DEPOSIT_AMOUNT],
    chain: lenderWallet.chain, account: lenderWallet.account!,
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  console.log(`  Deposited: ${explorerTx(depositTx)}`);
  console.log("LenderAgent: pool funded. Monitoring...\n");

  // Poll pool stats every 30s
  setInterval(async () => {
    try {
      const [balance, issued, repaid, active] = await publicClient.readContract({
        address: LENDING_POOL, abi: lendingPoolAbi, functionName: "getPoolStats",
      });
      console.log(
        `[pool] balance=${formatEther(balance)} USDC | issued=${issued} | repaid=${repaid} | active=${active}`
      );
    } catch (e: any) {
      console.warn("[pool] Stats read failed:", e.message);
    }
  }, 30_000);
}

run().catch(console.error);

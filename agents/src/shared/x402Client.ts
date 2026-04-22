/**
 * x402 payment client.
 * Flow: send request → receive 402 → submit ERC-20 transfer → retry with X-Payment header.
 */
import { parseEther } from "viem";
import type { WalletClient } from "viem";
import { publicClient } from "../chain.js";
import { MOCK_USDC } from "../config.js";
import { mockUsdcAbi } from "./contracts.js";
import { explorerTx } from "../config.js";

export interface PaymentHeader {
  amount: string;     // wei string
  recipient: string;  // 0x address
  chainId: number;
}

/**
 * Fetch an x402-gated URL, auto-paying if a 402 is returned.
 * @param url      Target endpoint
 * @param options  fetch() options
 * @param wallet   The wallet that pays
 */
export async function x402Fetch(
  url: string,
  options: RequestInit = {},
  wallet: WalletClient,
): Promise<Response> {
  // First attempt — no payment header
  const first = await fetch(url, options);

  if (first.status !== 402) return first;

  // Parse the payment requirement from the 402 response header
  const headerVal = first.headers.get("X-Payment-Required");
  if (!headerVal) throw new Error(`402 from ${url} but no X-Payment-Required header`);

  const req: PaymentHeader = JSON.parse(headerVal);
  const amount = BigInt(req.amount);
  const recipient = req.recipient as `0x${string}`;

  console.log(`  [x402] Paying ${req.amount} wei to ${recipient} for ${url}`);

  // Submit ERC-20 transfer
  const hash = await wallet.writeContract({
    address: MOCK_USDC,
    abi: mockUsdcAbi,
    functionName: "transfer",
    args: [recipient, amount],
    chain: wallet.chain,
    account: wallet.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  [x402] Payment confirmed: ${explorerTx(hash)}`);

  if (receipt.status !== "success") throw new Error(`Payment tx failed: ${hash}`);

  // Retry the request with proof-of-payment header
  const headers = new Headers(options.headers);
  headers.set("X-Payment", hash);

  return fetch(url, { ...options, headers });
}

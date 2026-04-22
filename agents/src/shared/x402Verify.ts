/**
 * x402 payment verifier (server-side).
 * Checks that the X-Payment tx hash actually transferred the expected amount to us.
 */
import { parseAbiItem } from "viem";
import { publicClient } from "../chain.js";
import { MOCK_USDC } from "../config.js";

// In-memory replay protection
const verifiedHashes = new Set<string>();

export interface VerifyResult {
  valid: boolean;
  payerAddress?: `0x${string}`;
  error?: string;
}

export async function verifyPayment(
  txHash: string,
  expectedRecipient: `0x${string}`,
  expectedAmountWei: bigint,
): Promise<VerifyResult> {
  if (!txHash) return { valid: false, error: "No X-Payment header" };
  if (verifiedHashes.has(txHash)) return { valid: false, error: "Replay: tx already used" };

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

    if (receipt.status !== "success") return { valid: false, error: "Tx failed" };

    // Find the ERC-20 Transfer log from MockUSDC
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const log = receipt.logs.find(
      (l) =>
        l.address.toLowerCase() === MOCK_USDC.toLowerCase() &&
        l.topics[0] === transferTopic,
    );

    if (!log) return { valid: false, error: "No USDC Transfer log found" };

    // Decode topics: Transfer(from, to, value)
    const from  = `0x${log.topics[1]?.slice(26)}` as `0x${string}`;
    const to    = `0x${log.topics[2]?.slice(26)}` as `0x${string}`;
    const value = BigInt(log.data);

    if (to.toLowerCase() !== expectedRecipient.toLowerCase())
      return { valid: false, error: `Wrong recipient: got ${to}` };

    if (value < expectedAmountWei)
      return { valid: false, error: `Underpayment: got ${value}, expected ${expectedAmountWei}` };

    verifiedHashes.add(txHash);
    return { valid: true, payerAddress: from };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}

/**
 * Express middleware factory. Rejects requests without valid X-Payment.
 */
export function requirePayment(recipientAddress: `0x${string}`, priceWei: bigint) {
  return async (req: any, res: any, next: any) => {
    const txHash = req.headers["x-payment"] as string | undefined;

    if (!txHash) {
      res.status(402)
        .set("X-Payment-Required", JSON.stringify({
          amount:    priceWei.toString(),
          recipient: recipientAddress,
          chainId:   5042002,
          token:     MOCK_USDC,
        }))
        .json({ error: "Payment required", price: priceWei.toString() });
      return;
    }

    const result = await verifyPayment(txHash, recipientAddress, priceWei);
    if (!result.valid) {
      res.status(402).json({ error: result.error });
      return;
    }

    // Attach payer info for downstream use
    (req as any).payerAddress = result.payerAddress;
    next();
  };
}

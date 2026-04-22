import { publicClient, ADDRESSES, lendingPoolAbi } from "../../../lib/contracts";
import { formatEther } from "viem";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [balance, issued, repaid, active] = await publicClient.readContract({
      address: ADDRESSES.microLendingPool,
      abi: lendingPoolAbi,
      functionName: "getPoolStats",
    });
    return Response.json({
      balance: formatEther(balance),
      issued: issued.toString(),
      repaid: repaid.toString(),
      active: active.toString(),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

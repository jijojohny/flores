import { publicClient, ADDRESSES, lendingPoolAbi } from "../../../lib/contracts";
import { formatEther } from "viem";

export const dynamic = "force-dynamic";

/** WAD fraction (1e18 = 100%) → percent string */
function wadToPercent(wad: bigint): string {
  return (Number(wad) / 1e16).toFixed(2);
}

export async function GET() {
  try {
    const pool = ADDRESSES.microLendingPool;
    const [stats, utilWad, aprWad] = await Promise.all([
      publicClient.readContract({
        address: pool,
        abi: lendingPoolAbi,
        functionName: "getPoolStats",
      }),
      publicClient.readContract({
        address: pool,
        abi: lendingPoolAbi,
        functionName: "utilizationWad",
      }),
      publicClient.readContract({
        address: pool,
        abi: lendingPoolAbi,
        functionName: "currentBorrowAprWad",
      }),
    ]);
    const [b, iss, rep, act] = stats as readonly [bigint, bigint, bigint, bigint];
    return Response.json({
      balance: formatEther(b),
      issued: iss.toString(),
      repaid: rep.toString(),
      active: act.toString(),
      utilizationPercent: wadToPercent(utilWad as bigint),
      borrowAprPercent: wadToPercent(aprWad as bigint),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

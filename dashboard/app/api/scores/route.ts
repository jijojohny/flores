import { formatEther } from "viem";
import {
  publicClient,
  ADDRESSES,
  creditScoreAbi,
  lendingPoolAbi,
  AGENT_META,
  EXPLORER,
} from "../../../lib/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const poolAddr = ADDRESSES.microLendingPool;
    const results = await Promise.all(
      AGENT_META.map(async (agent) => {
        const id = BigInt(agent.id);
        const [score, tier, loan, frozenForever, tierLimitWei, bps, strikes, debt] = await Promise.all([
          publicClient.readContract({
            address: ADDRESSES.agentCreditScore,
            abi: creditScoreAbi,
            functionName: "getCreditScore",
            args: [id],
          }),
          publicClient.readContract({
            address: ADDRESSES.agentCreditScore,
            abi: creditScoreAbi,
            functionName: "getTier",
            args: [id],
          }),
          publicClient.readContract({
            address: poolAddr,
            abi: lendingPoolAbi,
            functionName: "getLoan",
            args: [id],
          }),
          publicClient.readContract({
            address: poolAddr,
            abi: lendingPoolAbi,
            functionName: "hasDefaulted",
            args: [id],
          }),
          publicClient.readContract({
            address: ADDRESSES.agentCreditScore,
            abi: creditScoreAbi,
            functionName: "getTierBorrowLimitForAgent",
            args: [id],
          }),
          publicClient.readContract({
            address: poolAddr,
            abi: lendingPoolAbi,
            functionName: "getEffectiveBorrowLimitBps",
            args: [id],
          }),
          publicClient.readContract({
            address: poolAddr,
            abi: lendingPoolAbi,
            functionName: "defaultStrikeCount",
            args: [id],
          }),
          publicClient.readContract({
            address: poolAddr,
            abi: lendingPoolAbi,
            functionName: "totalDebt",
            args: [id],
          }),
        ]);

        const t = tier as string;
        const loanActive = loan.active;
        const effectiveMaxWei = (tierLimitWei * bps) / BigInt(10000);

        return {
          name: agent.name,
          id: agent.id,
          address: agent.address,
          role: agent.role,
          score: score.toString(),
          tier: t,
          tierMaxUsdc: formatEther(tierLimitWei),
          effectiveBorrowMaxUsdc: formatEther(effectiveMaxWei),
          borrowLimitBps: bps.toString(),
          defaultStrikes: strikes.toString(),
          hasDefaulted: frozenForever,
          loan: {
            active: loanActive,
            principalUsdc: loanActive ? formatEther(loan.principal) : null,
            interestAccruedUsdc: loanActive ? formatEther(loan.interestOwed) : null,
            totalDueUsdc: loanActive ? formatEther(debt[2]) : null,
            principalWei: loan.principal.toString(),
            interestWei: loan.interestOwed.toString(),
            issuedBlock: loan.issuedBlock.toString(),
            dueBlock: loan.dueBlock.toString(),
          },
          explorerAgentUrl: `${EXPLORER}/address/${agent.address}`,
          explorerPoolUrl: `${EXPLORER}/address/${poolAddr}`,
        };
      })
    );
    return Response.json(results);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

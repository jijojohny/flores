import { publicClient, ADDRESSES, creditScoreAbi, AGENT_META } from "../../../lib/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const results = await Promise.all(
      AGENT_META.map(async (agent) => {
        const id = BigInt(agent.id);
        const [score, tier] = await Promise.all([
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
        ]);
        return { name: agent.name, id: agent.id, address: agent.address, role: agent.role, score: score.toString(), tier };
      })
    );
    return Response.json(results);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

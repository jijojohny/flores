const ROWS = [
  {
    metric:    "Gas per transaction",
    ethereum:  "~$0.50–$5.00",
    arc:       "$0.00 (USDC gas token)",
    winner:    "arc",
  },
  {
    metric:    "Payment settlement",
    ethereum:  "15 sec block time",
    arc:       "~1 sec block time",
    winner:    "arc",
  },
  {
    metric:    "Credit check",
    ethereum:  "Off-chain oracle required",
    arc:       "On-chain, instant",
    winner:    "arc",
  },
  {
    metric:    "x402 micropayment",
    ethereum:  "Not economical",
    arc:       "$0.005 USDC fee",
    winner:    "arc",
  },
  {
    metric:    "Agent identity (ERC-8004)",
    ethereum:  "Standard deployed",
    arc:       "Deployed + live",
    winner:    "tie",
  },
  {
    metric:    "Lending pool settlement",
    ethereum:  "Multi-step, gas-intensive",
    arc:       "Single-tx approve+deposit",
    winner:    "arc",
  },
];

export default function EconomicsPanel() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <th className="pb-2 pr-4 text-left">Metric</th>
            <th className="pb-2 pr-4 text-left">Ethereum Mainnet</th>
            <th className="pb-2 text-left">Arc Testnet</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.metric} className="border-b border-zinc-100">
              <td className="py-2.5 pr-4 text-zinc-700 font-medium">{row.metric}</td>
              <td className="py-2.5 pr-4 text-zinc-400">{row.ethereum}</td>
              <td className={`py-2.5 font-medium ${row.winner === "arc" ? "text-emerald-600" : "text-zinc-600"}`}>
                {row.winner === "arc" && <span className="mr-1">✓</span>}
                {row.arc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-zinc-400">
        AgentCredit is purpose-built for Arc — native USDC gas token eliminates micropayment friction for AI agent economies.
      </p>
    </div>
  );
}

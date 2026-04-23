"use client";

import { useEffect, useState } from "react";
import { EXPLORER } from "../lib/contracts";

type LoanInfo = {
  active: boolean;
  principalUsdc: string | null;
  interestAccruedUsdc: string | null;
  totalDueUsdc: string | null;
  principalWei: string;
  interestWei: string;
  issuedBlock: string;
  dueBlock: string;
};

type AgentRow = {
  name: string;
  id: string;
  address: string;
  role: string;
  score: string;
  tier: string;
  tierMaxUsdc: string;
  effectiveBorrowMaxUsdc: string;
  borrowLimitBps: string;
  defaultStrikes: string;
  hasDefaulted: boolean;
  loan: LoanInfo;
  explorerAgentUrl: string;
  explorerPoolUrl: string;
};

const TIER_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800",
  B: "bg-blue-100 text-blue-800",
  C: "bg-yellow-100 text-yellow-800",
  D: "bg-zinc-100 text-zinc-600",
};

const ROLE_COLORS: Record<string, string> = {
  Seller: "text-purple-600",
  Borrower: "text-orange-600",
  Lender: "text-blue-600",
  Auditor: "text-teal-600",
};

export default function AgentTable() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const res = await fetch("/api/scores");
      if (res.ok) setAgents(await res.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="text-zinc-400 text-sm py-4">Loading agent scores...</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[1020px]">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500 text-xs uppercase tracking-wide">
            <th className="pb-2 pr-2">Agent</th>
            <th className="pb-2 pr-2">Role</th>
            <th className="pb-2 pr-2">ID</th>
            <th className="pb-2 pr-2">Score</th>
            <th className="pb-2 pr-2">Tier</th>
            <th className="pb-2 pr-2">Tier max</th>
            <th className="pb-2 pr-2">Effective max</th>
            <th className="pb-2 pr-2">Strikes</th>
            <th className="pb-2 pr-2">Loan</th>
            <th className="pb-2 pr-2">Due</th>
            <th className="pb-2 pr-2">Links</th>
            <th className="pb-2">Addr</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors align-top">
              <td className="py-2.5 pr-2 font-medium text-zinc-900">{a.name}</td>
              <td className={`py-2.5 pr-2 font-medium ${ROLE_COLORS[a.role] ?? "text-zinc-600"}`}>{a.role}</td>
              <td className="py-2.5 pr-2 text-zinc-500">#{a.id}</td>
              <td className="py-2.5 pr-2 font-mono font-semibold text-zinc-800">{a.score}</td>
              <td className="py-2.5 pr-2">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                    TIER_COLORS[a.tier as string] ?? TIER_COLORS.D
                  }`}
                >
                  {a.tier as string}
                </span>
                {a.hasDefaulted ? (
                  <span className="ml-1 text-[10px] uppercase text-red-600 font-semibold">frozen</span>
                ) : null}
              </td>
              <td className="py-2.5 pr-2 text-zinc-700 font-mono text-xs">
                {parseFloat(a.tierMaxUsdc) > 0 ? `${parseFloat(a.tierMaxUsdc).toFixed(2)}` : "—"}
              </td>
              <td className="py-2.5 pr-2 text-zinc-700 font-mono text-xs" title={`Borrow cap bps: ${a.borrowLimitBps}/10000`}>
                {parseFloat(a.effectiveBorrowMaxUsdc) > 0 ? `${parseFloat(a.effectiveBorrowMaxUsdc).toFixed(2)}` : "—"}
              </td>
              <td className="py-2.5 pr-2 text-zinc-600">{a.defaultStrikes}</td>
              <td className="py-2.5 pr-2 text-xs text-zinc-700 max-w-[200px]">
                {a.loan.active ? (
                  <div className="flex flex-col gap-0.5">
                    <span>P: {parseFloat(a.loan.principalUsdc ?? "0").toFixed(4)} USDC</span>
                    <span className="text-zinc-500">Int: {parseFloat(a.loan.interestAccruedUsdc ?? "0").toFixed(4)}</span>
                    <span className="font-semibold text-zinc-800">Due: {parseFloat(a.loan.totalDueUsdc ?? "0").toFixed(4)}</span>
                  </div>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td className="py-2.5 pr-2 font-mono text-xs text-zinc-600">
                {a.loan.active ? a.loan.dueBlock : "—"}
              </td>
              <td className="py-2.5 pr-2 text-xs">
                <div className="flex flex-col gap-0.5">
                  <a
                    href={a.explorerAgentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Agent txs
                  </a>
                  <a
                    href={a.explorerPoolUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Pool
                  </a>
                </div>
              </td>
              <td className="py-2.5">
                <a
                  href={`${EXPLORER}/address/${a.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-blue-600 hover:underline"
                >
                  {a.address.slice(0, 6)}…{a.address.slice(-4)}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

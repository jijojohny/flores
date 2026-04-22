"use client";

import { useEffect, useState } from "react";
import { EXPLORER } from "../lib/contracts";

type AgentRow = {
  name: string;
  id: string;
  address: string;
  role: string;
  score: string;
  tier: string;
};

const TIER_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800",
  B: "bg-blue-100 text-blue-800",
  C: "bg-yellow-100 text-yellow-800",
  D: "bg-zinc-100 text-zinc-600",
};

const ROLE_COLORS: Record<string, string> = {
  Seller:   "text-purple-600",
  Borrower: "text-orange-600",
  Lender:   "text-blue-600",
  Auditor:  "text-teal-600",
};

export default function AgentTable() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const res = await fetch("/api/scores");
      if (res.ok) setAgents(await res.json());
    } catch {}
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
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500 text-xs uppercase tracking-wide">
            <th className="pb-2 pr-4">Agent</th>
            <th className="pb-2 pr-4">Role</th>
            <th className="pb-2 pr-4">ID</th>
            <th className="pb-2 pr-4">Score</th>
            <th className="pb-2 pr-4">Tier</th>
            <th className="pb-2">Address</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
              <td className="py-2.5 pr-4 font-medium text-zinc-900">{a.name}</td>
              <td className={`py-2.5 pr-4 font-medium ${ROLE_COLORS[a.role] ?? "text-zinc-600"}`}>{a.role}</td>
              <td className="py-2.5 pr-4 text-zinc-500">#{a.id}</td>
              <td className="py-2.5 pr-4 font-mono font-semibold text-zinc-800">{a.score}</td>
              <td className="py-2.5 pr-4">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[a.tier as string] ?? TIER_COLORS.D}`}>
                  {a.tier as string}
                </span>
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

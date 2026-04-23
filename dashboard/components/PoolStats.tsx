"use client";

import { useEffect, useState } from "react";

type Stats = {
  balance: string;
  issued: string;
  repaid: string;
  active: string;
  utilizationPercent?: string;
  borrowAprPercent?: string;
};

const CARDS = [
  { key: "balance" as const, label: "Pool Balance", suffix: " USDC", color: "text-blue-600" },
  { key: "issued" as const, label: "Loans Issued", suffix: "", color: "text-purple-600" },
  { key: "repaid" as const, label: "Loans Repaid", suffix: "", color: "text-emerald-600" },
  { key: "active" as const, label: "Active Loans", suffix: "", color: "text-orange-600" },
];

export default function PoolStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/pool");
      if (res.ok) setStats(await res.json());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {CARDS.map(({ key, label, suffix, color }) => (
          <div key={key} className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col gap-1">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
            <span className={`text-2xl font-bold ${color}`}>
              {stats
                ? `${key === "balance" ? parseFloat(stats[key]).toFixed(0) : stats[key]}${suffix}`
                : "—"}
            </span>
          </div>
        ))}
      </div>
      {(stats?.utilizationPercent != null || stats?.borrowAprPercent != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Pool utilization</span>
            <span className="text-xl font-semibold text-zinc-800 mt-1 block">
              {stats.utilizationPercent != null ? `${stats.utilizationPercent}%` : "—"}
            </span>
            <p className="text-[11px] text-zinc-400 mt-1">Borrowed / (idle cash + outstanding principal)</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Borrow APR (annual, utilization-based)</span>
            <span className="text-xl font-semibold text-zinc-800 mt-1 block">
              {stats.borrowAprPercent != null ? `${stats.borrowAprPercent}%` : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

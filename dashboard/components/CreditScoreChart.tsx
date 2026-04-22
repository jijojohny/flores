"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type DataPoint = { iteration: number; score: number };

export default function CreditScoreChart() {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    // Seed with current score on mount
    fetch("/api/scores")
      .then((r) => r.json())
      .then((agents: { name: string; score: string }[]) => {
        const analyst = agents.find((a) => a.name === "AnalystAgent");
        if (analyst) {
          setData([{ iteration: 0, score: parseInt(analyst.score, 10) }]);
        }
      })
      .catch(() => {});

    const es = new EventSource("/api/events");

    es.addEventListener("report", async (e) => {
      try {
        const report = JSON.parse((e as MessageEvent).data);
        // Fetch fresh score after each report
        const res = await fetch("/api/scores");
        if (!res.ok) return;
        const agents: { name: string; score: string }[] = await res.json();
        const analyst = agents.find((a) => a.name === "AnalystAgent");
        if (!analyst) return;
        setData((prev) => {
          const next = [...prev, { iteration: report.iteration, score: parseInt(analyst.score, 10) }];
          return next;
        });
      } catch {}
    });

    return () => es.close();
  }, []);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-400 text-sm">
        Chart updates live as AnalystAgent runs iterations...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="iteration"
          tickFormatter={(v) => (v === 0 ? "Start" : `Iter ${v}`)}
          tick={{ fontSize: 11, fill: "#6b7280" }}
        />
        <YAxis domain={[0, 900]} tick={{ fontSize: 11, fill: "#6b7280" }} width={36} />
        <Tooltip
          formatter={(v) => [v, "Credit Score"]}
          labelFormatter={(l) => (l === 0 ? "Baseline" : `Iteration ${l}`)}
        />
        <ReferenceLine y={750} stroke="#10b981" strokeDasharray="4 4" label={{ value: "A", position: "right", fontSize: 10, fill: "#10b981" }} />
        <ReferenceLine y={500} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: "B", position: "right", fontSize: 10, fill: "#3b82f6" }} />
        <ReferenceLine y={250} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "C", position: "right", fontSize: 10, fill: "#f59e0b" }} />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ r: 3, fill: "#6366f1" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

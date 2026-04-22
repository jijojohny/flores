"use client";

import { useEffect, useState } from "react";
import { EXPLORER } from "../lib/contracts";

type FeedEvent = {
  id: number;
  type: string;
  label: string;
  hash?: string;
  detail?: string;
  ts: number;
};

let _id = 0;

function makeEvent(event: string, data: Record<string, unknown>): FeedEvent {
  const ts = (data.ts as number) ?? Date.now();
  const hash = data.hash as string | undefined;
  const id = _id++;

  switch (event) {
    case "report":
      return { id, type: "report", label: `Iteration ${data.iteration}: BTC $${Number(data.btcPrice).toLocaleString()} · ETH $${Number(data.ethPrice).toLocaleString()}`, detail: data.analysis as string, ts };
    case "loan_issued":
      return { id, type: "loan", label: `Loan issued — ${data.amount} USDC (Tier ${data.tier})`, hash, ts };
    case "loan_repaid":
      return { id, type: "repay", label: "Loan repaid on time", hash, ts };
    case "done":
      return { id, type: "done", label: `All ${data.totalIterations} iterations complete`, ts };
    case "status":
      if (!data.connected) return { id, type: "status", label: "Waiting for AnalystAgent...", ts };
      return { id, type: "status", label: "AnalystAgent connected", ts };
    default:
      return { id, type: "info", label: event, ts };
  }
}

const TYPE_STYLES: Record<string, string> = {
  report: "border-l-blue-400",
  loan:   "border-l-purple-400",
  repay:  "border-l-emerald-400",
  done:   "border-l-orange-400",
  status: "border-l-zinc-300",
  info:   "border-l-zinc-200",
};

export default function TransactionFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/events");

    const handle = (event: MessageEvent, name: string) => {
      try {
        const data = JSON.parse(event.data);
        if (name === "heartbeat") return;
        if (name === "status") {
          setConnected(!!data.connected);
          // Only add disconnect to feed when we were previously connected
          if (!data.connected) return;
        }
        setEvents((prev) => [makeEvent(name, data), ...prev].slice(0, 30));
      } catch {}
    };

    const eventNames = ["report", "loan_issued", "loan_repaid", "done", "status", "heartbeat"];
    for (const name of eventNames) {
      es.addEventListener(name, (e) => handle(e as MessageEvent, name));
    }

    return () => es.close();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-zinc-300"}`} />
        <span className="text-xs text-zinc-500">{connected ? "Live — AnalystAgent broadcasting" : "Waiting for AnalystAgent..."}</span>
      </div>
      {events.length === 0 && (
        <div className="text-sm text-zinc-400 py-4">No events yet. Start the demo to see live activity.</div>
      )}
      <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
        {events.map((e) => (
          <div key={e.id} className={`border-l-4 pl-3 py-1.5 bg-zinc-50 rounded-r ${TYPE_STYLES[e.type] ?? TYPE_STYLES.info}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm text-zinc-800">{e.label}</span>
              <span className="text-xs text-zinc-400 whitespace-nowrap">
                {new Date(e.ts).toLocaleTimeString()}
              </span>
            </div>
            {e.detail && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{e.detail}</p>}
            {e.hash && (
              <a
                href={`${EXPLORER}/tx/${e.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline font-mono"
              >
                {e.hash.slice(0, 10)}…
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

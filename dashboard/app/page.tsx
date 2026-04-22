import AgentTable from "../components/AgentTable";
import CreditScoreChart from "../components/CreditScoreChart";
import TransactionFeed from "../components/TransactionFeed";
import PoolStats from "../components/PoolStats";
import EconomicsPanel from "../components/EconomicsPanel";
import { EXPLORER } from "../lib/contracts";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">AgentCredit</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Decentralized credit scoring &amp; micro-lending for AI agents on Arc
          </p>
        </div>
        <a
          href={EXPLORER}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-full hover:bg-zinc-700 transition-colors"
        >
          ArcScan Explorer →
        </a>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Pool Stats */}
        <PoolStats />

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Agent Table + Chart */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <section className="bg-white border border-zinc-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide mb-4">
                Agent Credit Scores
              </h2>
              <AgentTable />
            </section>

            <section className="bg-white border border-zinc-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide mb-4">
                AnalystAgent Score History
              </h2>
              <CreditScoreChart />
            </section>
          </div>

          {/* Right: Live Feed */}
          <div className="lg:col-span-1">
            <section className="bg-white border border-zinc-200 rounded-xl p-5 h-full">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide mb-4">
                Live Agent Events
              </h2>
              <TransactionFeed />
            </section>
          </div>
        </div>

        {/* Economics Panel */}
        <section className="bg-white border border-zinc-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide mb-4">
            Why Arc? Economics Comparison
          </h2>
          <EconomicsPanel />
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-zinc-400 pb-4">
          AgentCredit · Built on Arc (Chain ID 5042002) · Hackathon Demo 2026
        </footer>
      </main>
    </div>
  );
}

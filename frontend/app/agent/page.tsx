"use client";

import { useState } from "react";
import Navbar from "../components/Navbar";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Terminal,
  RefreshCw,
  Filter,
  ExternalLink,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Mock activity data — replace with real event fetching from
// PolicyGuard's TransactionApproved / TransactionBlocked events
// using publicClient.getLogs({ address: POLICY_GUARD_ADDRESS, ... })
// ─────────────────────────────────────────────────────────────

type TxStatus = "approved" | "blocked" | "pending_approval";

interface ActivityEntry {
  id: string;
  timestamp: string;
  status: TxStatus;
  target: string;
  targetLabel?: string;
  value: string;
  token: string;
  reason?: string;
  txHash?: string;
  agentEns: string;
}

const MOCK_ACTIVITY: ActivityEntry[] = [
  {
    id: "1",
    timestamp: "2024-01-15T14:32:11Z",
    status: "approved",
    target: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    targetLabel: "Uniswap Universal Router",
    value: "25",
    token: "USDC",
    txHash: "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    agentEns: "allowance-test-123.eth",
  },
  {
    id: "2",
    timestamp: "2024-01-15T13:15:03Z",
    status: "blocked",
    target: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    targetLabel: "Uniswap Universal Router",
    value: "51",
    token: "USDC",
    reason: "ExceedsDailyCap — $51 > $50 daily limit",
    agentEns: "allowance-test-123.eth",
  },
  {
    id: "3",
    timestamp: "2024-01-15T11:00:55Z",
    status: "pending_approval",
    target: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    targetLabel: "Uniswap Universal Router",
    value: "35",
    token: "USDC",
    reason: "ExceedsApprovalThreshold — $35 ≥ $30 threshold, needs human approval",
    agentEns: "allowance-test-123.eth",
  },
  {
    id: "4",
    timestamp: "2024-01-15T09:45:22Z",
    status: "blocked",
    target: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    targetLabel: "SushiSwap Router",
    value: "10",
    token: "USDC",
    reason: "TargetNotAllowlisted — SushiSwap not on allowlist",
    agentEns: "allowance-test-123.eth",
  },
  {
    id: "5",
    timestamp: "2024-01-14T17:22:01Z",
    status: "approved",
    target: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    targetLabel: "Uniswap Universal Router",
    value: "15",
    token: "USDC",
    txHash: "0xdef456abc123def456abc123def456abc123def456abc123def456abc123def4",
    agentEns: "allowance-test-123.eth",
  },
  {
    id: "6",
    timestamp: "2024-01-14T08:12:44Z",
    status: "blocked",
    target: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    targetLabel: "Uniswap Universal Router",
    value: "20",
    token: "USDC",
    reason: "OutsideTimeWindow — request at 02:12 UTC, window is 09:00–17:00",
    agentEns: "allowance-test-123.eth",
  },
];

const statusConfig = {
  approved: {
    icon: CheckCircle2,
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/20",
    badge: "badge-success",
    label: "Approved",
  },
  blocked: {
    icon: XCircle,
    color: "text-danger",
    bg: "bg-danger/10",
    border: "border-danger/20",
    badge: "badge-danger",
    label: "Blocked",
  },
  pending_approval: {
    icon: AlertTriangle,
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/20",
    badge: "badge-warning",
    label: "Needs Approval",
  },
};

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AgentPage() {
  const [filter, setFilter] = useState<TxStatus | "all">("all");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = filter === "all" ? MOCK_ACTIVITY : MOCK_ACTIVITY.filter((a) => a.status === filter);

  const stats = {
    approved: MOCK_ACTIVITY.filter((a) => a.status === "approved").length,
    blocked: MOCK_ACTIVITY.filter((a) => a.status === "blocked").length,
    pending: MOCK_ACTIVITY.filter((a) => a.status === "pending_approval").length,
  };

  const handleRefresh = () => {
    setRefreshing(true);
    // TODO: replace with real event fetch:
    // publicClient.getLogs({ address: POLICY_GUARD_ADDRESS, events: [...], fromBlock: 'latest' - 1000n })
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Terminal className="w-5 h-5 text-brand-400" />
              <h1 className="text-2xl font-bold text-white">Agent Activity</h1>
            </div>
            <p className="text-gray-400 text-sm">
              Real-time log of PolicyGuard enforcement decisions
            </p>
          </div>
          <button
            className="btn-secondary"
            onClick={handleRefresh}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Approved", value: stats.approved, color: "text-success", bg: "bg-success/10", border: "border-success/20" },
            { label: "Blocked", value: stats.blocked, color: "text-danger", bg: "bg-danger/10", border: "border-danger/20" },
            { label: "Needs Approval", value: stats.pending, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} className={`card p-4 ${bg} border ${border}`}>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-3.5 h-3.5 text-gray-500" />
          {(["all", "approved", "blocked", "pending_approval"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === f
                  ? "bg-brand-600/20 text-brand-300 border border-brand-500/30"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              {f === "all" ? "All" : f === "pending_approval" ? "Needs Approval" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Activity feed */}
        <div className="space-y-2">
          {filtered.map((entry) => {
            const { icon: Icon, color, bg, border, badge, label } = statusConfig[entry.status];
            return (
              <div
                key={entry.id}
                className={`card p-4 ${entry.status !== "approved" ? `${bg} border ${border}` : ""}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${badge} text-[10px]`}>{label}</span>
                      <span className="text-sm font-medium text-white">
                        {entry.value} {entry.token}
                      </span>
                      <span className="text-gray-500 text-xs">→</span>
                      <span className="text-xs text-gray-300">
                        {entry.targetLabel ?? shortenAddr(entry.target)}
                      </span>
                      <span className="font-mono text-[10px] text-gray-600">
                        {shortenAddr(entry.target)}
                      </span>
                    </div>

                    {entry.reason && (
                      <p className={`text-xs mt-1 ${color} opacity-80`}>{entry.reason}</p>
                    )}

                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-gray-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(entry.timestamp)}
                      </span>
                      <span className="text-[10px] text-gray-600 font-mono">{entry.agentEns}</span>
                      {entry.txHash && (
                        <a
                          href={`https://sepolia.etherscan.io/tx/${entry.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-0.5"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          Etherscan
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Integration note */}
        <div className="mt-8 card p-4 border-brand-700/30">
          <p className="label mb-2">🔌 Wire up real events</p>
          <p className="text-xs text-gray-500">
            Replace mock data with real PolicyGuard events using <code className="text-brand-300">publicClient.getLogs()</code>:
          </p>
          <pre className="mt-2 text-xs font-mono text-gray-400 bg-surface-200/50 p-3 rounded-lg overflow-x-auto">{`const logs = await publicClient.getLogs({
  address: POLICY_GUARD_ADDRESS,
  events: [TransactionApprovedABI, TransactionBlockedABI],
  fromBlock: 'latest' - 5000n,
});`}</pre>
        </div>
      </div>
    </div>
  );
}

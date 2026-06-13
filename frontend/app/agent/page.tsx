"use client";

import { useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle,
  Terminal, RefreshCw, ExternalLink, Loader2, Shield,
} from "lucide-react";
import { createPublicClient, http, parseAbiItem, namehash, type Address } from "viem";
import { sepolia } from "viem/chains";
import { POLICY_GUARD_ADDRESS } from "@/lib/ensClient";

// Dedicated logs client on a public RPC — Alchemy free tier limits getLogs to 10 blocks
const logsClient = createPublicClient({
  chain: sepolia,
  transport: http("https://sepolia.drpc.org"),
});

// ─── Event ABIs ───────────────────────────────────────────────

const APPROVED_EVENT       = parseAbiItem("event TransactionApproved(bytes32 indexed namehash, address target, uint256 value)");
const HUMAN_APPROVED_EVENT = parseAbiItem("event TransactionApprovedByHuman(bytes32 indexed namehash, address target, uint256 value, address approver)");
const BLOCKED_EVENT        = parseAbiItem("event TransactionBlocked(bytes32 indexed namehash, address target, uint256 value, string reason)");
const POLICY_UPDATED_EVENT = parseAbiItem("event PolicyUpdated(bytes32 indexed namehash, bytes32 policyHash, address updatedBy)");

// ─── Constants ───────────────────────────────────────────────

const TARGET_LABELS: Record<string, string> = {
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap Universal",
  "0x000000000000000000000000000000000000dead": "Burn Address",
};

const KNOWN_NODES: Record<string, string> = {
  [namehash("traderbot.eth")]: "traderbot.eth",
};

const SAVED_AGENT_KEY = "allowance_agent_name";

// ─── Types ───────────────────────────────────────────────────

type EntryStatus = "approved" | "human_approved" | "blocked" | "policy_updated";

interface LogEntry {
  id: string;
  blockNumber: bigint;
  txHash: string;
  status: EntryStatus;
  namehash: string;
  agentName: string;
  target?: string;
  value?: bigint;
  reason?: string;
  approver?: string;
  policyHash?: string;
  updatedBy?: string;
}

const STATUS_CONFIG = {
  approved: {
    icon: CheckCircle2, color: "text-success",
    bg: "bg-success/10", border: "border-success/20",
    label: "Approved",
  },
  human_approved: {
    icon: Shield, color: "text-brand-300",
    bg: "bg-brand-600/10", border: "border-brand-500/20",
    label: "Human Approved",
  },
  blocked: {
    icon: XCircle, color: "text-danger",
    bg: "bg-danger/10", border: "border-danger/20",
    label: "Blocked",
  },
  policy_updated: {
    icon: RefreshCw, color: "text-gray-400",
    bg: "bg-surface-200/50", border: "border-surface-300/30",
    label: "Policy Updated",
  },
};

// ─── Helpers ─────────────────────────────────────────────────

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function labelTarget(addr: string): string {
  return TARGET_LABELS[addr.toLowerCase()] ?? shortenAddr(addr);
}

function formatUsdc(wei: bigint): string {
  return `$${(Number(wei) / 1e18).toFixed(2)}`;
}

function nodeToName(node: string, agentName: string): string {
  const saved = KNOWN_NODES[node];
  if (saved) return saved;
  if (agentName && namehash(agentName) === node) return agentName;
  return shortenAddr(node);
}

// ─── Fetcher ─────────────────────────────────────────────────

async function fetchLogs(agentName: string): Promise<LogEntry[]> {
  const latestBlock = await logsClient.getBlockNumber();
  const fromBlock = latestBlock > BigInt(10000) ? latestBlock - BigInt(10000) : BigInt(0);

  // Optionally filter by namehash if agent name is provided
  const nodeFilter = agentName.includes(".") ? [namehash(agentName) as `0x${string}`] : undefined;

  const [approvedLogs, humanLogs, blockedLogs, updatedLogs] = await Promise.all([
    logsClient.getLogs({ address: POLICY_GUARD_ADDRESS as Address, event: APPROVED_EVENT, args: nodeFilter ? { namehash: nodeFilter } : {}, fromBlock }),
    logsClient.getLogs({ address: POLICY_GUARD_ADDRESS as Address, event: HUMAN_APPROVED_EVENT, args: nodeFilter ? { namehash: nodeFilter } : {}, fromBlock }),
    logsClient.getLogs({ address: POLICY_GUARD_ADDRESS as Address, event: BLOCKED_EVENT, args: nodeFilter ? { namehash: nodeFilter } : {}, fromBlock }),
    logsClient.getLogs({ address: POLICY_GUARD_ADDRESS as Address, event: POLICY_UPDATED_EVENT, args: nodeFilter ? { namehash: nodeFilter } : {}, fromBlock }),
  ]);

  const entries: LogEntry[] = [];

  for (const log of approvedLogs) {
    const node = log.args.namehash as string;
    entries.push({
      id: `${log.transactionHash}-approved`,
      blockNumber: log.blockNumber ?? BigInt(0),
      txHash: log.transactionHash ?? "",
      status: "approved",
      namehash: node,
      agentName: nodeToName(node, agentName),
      target: log.args.target as string,
      value: log.args.value as bigint,
    });
  }

  for (const log of humanLogs) {
    const node = log.args.namehash as string;
    entries.push({
      id: `${log.transactionHash}-human`,
      blockNumber: log.blockNumber ?? BigInt(0),
      txHash: log.transactionHash ?? "",
      status: "human_approved",
      namehash: node,
      agentName: nodeToName(node, agentName),
      target: log.args.target as string,
      value: log.args.value as bigint,
      approver: log.args.approver as string,
    });
  }

  for (const log of blockedLogs) {
    const node = log.args.namehash as string;
    entries.push({
      id: `${log.transactionHash}-blocked`,
      blockNumber: log.blockNumber ?? BigInt(0),
      txHash: log.transactionHash ?? "",
      status: "blocked",
      namehash: node,
      agentName: nodeToName(node, agentName),
      target: log.args.target as string,
      value: log.args.value as bigint,
      reason: log.args.reason as string,
    });
  }

  for (const log of updatedLogs) {
    const node = log.args.namehash as string;
    entries.push({
      id: `${log.transactionHash}-updated`,
      blockNumber: log.blockNumber ?? BigInt(0),
      txHash: log.transactionHash ?? "",
      status: "policy_updated",
      namehash: node,
      agentName: nodeToName(node, agentName),
      policyHash: log.args.policyHash as string,
      updatedBy: log.args.updatedBy as string,
    });
  }

  return entries.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1));
}

// ─── Component ───────────────────────────────────────────────

export default function AgentPage() {
  const [agentName, setAgentName] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EntryStatus | "all">("all");
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // Load saved agent name from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SAVED_AGENT_KEY) || "";
    setAgentName(saved);
  }, []);

  const refresh = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const entries = await fetchLogs(name);
      setLogs(entries);
      setLastFetched(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on load and when agent name changes (debounced)
  useEffect(() => {
    const t = setTimeout(() => refresh(agentName), 300);
    return () => clearTimeout(t);
  }, [agentName, refresh]);

  const handleNameChange = (name: string) => {
    setAgentName(name);
    localStorage.setItem(SAVED_AGENT_KEY, name);
  };

  const filtered = filter === "all" ? logs : logs.filter((l) => l.status === filter);

  const stats = {
    approved: logs.filter((l) => l.status === "approved" || l.status === "human_approved").length,
    blocked: logs.filter((l) => l.status === "blocked").length,
    updated: logs.filter((l) => l.status === "policy_updated").length,
  };

  const guardDeployed = POLICY_GUARD_ADDRESS !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Terminal className="w-5 h-5 text-brand-400" />
              <h1 className="text-2xl font-bold text-white">Agent Activity Log</h1>
            </div>
            <p className="text-gray-500 text-sm">
              Live PolicyGuard enforcement events from Sepolia
              {lastFetched && (
                <span className="ml-2 text-gray-600">
                  · refreshed {lastFetched.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <button className="btn-secondary" onClick={() => refresh(agentName)} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Agent name filter */}
        <div className="card p-4 mb-5 flex items-center gap-3">
          <label className="label whitespace-nowrap">Agent ENS</label>
          <input
            className="input-field font-mono flex-1 text-sm"
            placeholder="traderbot.eth — leave blank for all agents"
            value={agentName}
            onChange={(e) => handleNameChange(e.target.value)}
          />
          {agentName && (
            <span className="text-[10px] font-mono text-gray-600 whitespace-nowrap">
              {namehash(agentName).slice(0, 10)}…
            </span>
          )}
        </div>

        {!guardDeployed && (
          <div className="card p-4 mb-5 border-warning/30 bg-warning/5 text-warning text-sm">
            PolicyGuard address not set — configure NEXT_PUBLIC_POLICY_GUARD_ADDRESS.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Approved", value: stats.approved, color: "text-success", bg: "bg-success/10", border: "border-success/20" },
            { label: "Blocked", value: stats.blocked, color: "text-danger", bg: "bg-danger/10", border: "border-danger/20" },
            { label: "Policy Updates", value: stats.updated, color: "text-gray-400", bg: "bg-surface-200/50", border: "border-surface-300/30" },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} className={`card p-4 ${bg} border ${border}`}>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-4">
          {(["all", "approved", "human_approved", "blocked", "policy_updated"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === f
                  ? "bg-brand-600/20 text-brand-300 border border-brand-500/30"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              {f === "all" ? "All"
                : f === "human_approved" ? "Human Approved"
                : f === "policy_updated" ? "Policy Updates"
                : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="card p-4 mb-4 border-danger/30 bg-danger/5 text-danger text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && logs.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Fetching on-chain events…
          </div>
        )}

        {/* Empty state */}
        {!loading && logs.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-600 text-sm gap-2">
            <Terminal className="w-8 h-8 opacity-30" />
            <p>No events found in the last 10,000 blocks.</p>
            <p className="text-xs text-gray-700">Run demo scripts or simulate a transaction to generate events.</p>
          </div>
        )}

        {/* Log feed */}
        <div className="space-y-2">
          {filtered.map((entry) => {
            const { icon: Icon, color, bg, border, label } = STATUS_CONFIG[entry.status];
            return (
              <div key={entry.id} className={`card p-4 ${bg} border ${border}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium ${color}`}>{label}</span>

                      {entry.value !== undefined && (
                        <span className="text-sm font-medium text-white">
                          {formatUsdc(entry.value)}
                        </span>
                      )}

                      {entry.target && (
                        <>
                          <span className="text-gray-500 text-xs">→</span>
                          <span className="text-xs text-gray-300">{labelTarget(entry.target)}</span>
                        </>
                      )}

                      {entry.approver && (
                        <span className="text-xs text-brand-300 font-mono">
                          by {shortenAddr(entry.approver)}
                        </span>
                      )}
                    </div>

                    {entry.reason && (
                      <p className={`text-xs mt-1 ${color} opacity-80 font-mono`}>{entry.reason}</p>
                    )}

                    {entry.policyHash && (
                      <p className="text-[10px] font-mono text-gray-600 mt-1 truncate">
                        hash: {entry.policyHash.slice(0, 20)}…
                        {entry.updatedBy && ` · by ${shortenAddr(entry.updatedBy)}`}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-gray-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        block {entry.blockNumber.toString()}
                      </span>
                      <span className="text-[10px] font-mono text-gray-600">{entry.agentName}</span>
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
      </div>
    </div>
  );
}

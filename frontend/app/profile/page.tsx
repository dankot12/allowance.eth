"use client";

import { useState } from "react";
import Navbar from "../components/Navbar";
import PolicyCard from "../components/PolicyCard";
import {
  Search,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  LinkIcon,
} from "lucide-react";
import type { AllowancePolicy } from "@/lib/policySchema";
import { fetchPolicy, fetchOnChainPolicyHash, computePolicyHash, POLICY_ENS_KEY } from "@/lib/ensClient";

interface ProfileState {
  loading: boolean;
  policy: AllowancePolicy | null;
  onChainHash: string | null;
  error: string | null;
  ensName: string | null;
}

export default function ProfilePage() {
  const [input, setInput] = useState("allowance-test-123.eth");
  const [state, setState] = useState<ProfileState>({
    loading: false,
    policy: null,
    onChainHash: null,
    error: null,
    ensName: null,
  });

  const lookup = async (name?: string) => {
    const query = (name ?? input).trim();
    if (!query) return;

    setState({ loading: true, policy: null, onChainHash: null, error: null, ensName: query });

    try {
      const [policy, onChainHash] = await Promise.all([
        fetchPolicy(query),
        fetchOnChainPolicyHash(query),
      ]);

      if (!policy) {
        setState({
          loading: false,
          policy: null,
          onChainHash,
          error: `No policy found for ${query}. Make sure the ENS name has a text record at key "${POLICY_ENS_KEY}".`,
          ensName: query,
        });
        return;
      }

      setState({ loading: false, policy, onChainHash, error: null, ensName: query });
    } catch (err) {
      setState({
        loading: false,
        policy: null,
        onChainHash: null,
        error: err instanceof Error ? err.message : "Lookup failed",
        ensName: query,
      });
    }
  };

  const hashMatch =
    state.policy && state.onChainHash
      ? computePolicyHash(JSON.stringify(state.policy)) === state.onChainHash
      : null;

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Search className="w-5 h-5 text-brand-400" />
            <h1 className="text-2xl font-bold text-white">ENS Policy Viewer</h1>
          </div>
          <p className="text-gray-400 text-sm">
            Look up any agent's policy stored on their ENS name
          </p>
        </div>

        {/* Search */}
        <div className="card p-4 mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              className="input-field flex-1"
              placeholder="myagent.eth"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
            />
            <button
              className="btn-primary px-6"
              onClick={() => lookup()}
              disabled={state.loading}
            >
              {state.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex gap-2 mt-3 flex-wrap">
            <p className="text-xs text-gray-600">Try:</p>
            {["allowance-test-123.eth"].map((ex) => (
              <button
                key={ex}
                className="text-xs text-brand-400 hover:text-brand-300 font-mono"
                onClick={() => { setInput(ex); lookup(ex); }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {state.error && !state.loading && (
          <div className="flex items-start gap-2.5 p-4 rounded-xl bg-danger/10 border border-danger/20 mb-4">
            <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-danger">Not found</p>
              <p className="text-xs text-gray-500 mt-0.5">{state.error}</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {state.loading && (
          <div className="space-y-3">
            <div className="card p-5">
              <div className="shimmer h-5 rounded w-1/2 mb-3" />
              <div className="shimmer h-3 rounded w-3/4 mb-2" />
              <div className="shimmer h-3 rounded w-2/3" />
            </div>
          </div>
        )}

        {/* Result */}
        {state.policy && !state.loading && (
          <div className="space-y-4">
            {/* ENS profile header */}
            <div className="card-glow p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-bold text-white text-lg">{state.ensName}</h2>
                  <a
                    href={`https://explorer.ens.dev/${state.ensName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 mt-1"
                  >
                    <LinkIcon className="w-3 h-3" />
                    View on ENS App
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <button
                  className="btn-ghost py-1.5 px-2.5 text-xs"
                  onClick={() => lookup()}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>

              {/* Verification status */}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-200 border border-surface-300 text-xs">
                  <span className="status-dot-active" />
                  ENS text record found
                </div>
                {hashMatch !== null && (
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${
                      hashMatch
                        ? "bg-success/10 border-success/20 text-success"
                        : "bg-warning/10 border-warning/20 text-warning"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${hashMatch ? "bg-success" : "bg-warning"}`} />
                    {hashMatch ? "Hash verified on-chain" : "Hash mismatch — policy may be stale"}
                  </div>
                )}
                {hashMatch === null && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-200 border border-surface-300 text-xs text-gray-500">
                    PolicyGuard not deployed
                  </div>
                )}
              </div>

              {/* Text record key */}
              <div className="p-3 rounded-lg bg-surface-200/50 border border-surface-300/50">
                <p className="label mb-1">Text record key</p>
                <code className="text-xs text-brand-300">{POLICY_ENS_KEY}</code>
              </div>
            </div>

            {/* Policy card */}
            <PolicyCard
              policy={state.policy}
              ensName={state.ensName ?? undefined}
              policyHash={state.onChainHash ?? undefined}
            />

            {/* Raw JSON */}
            <details className="card overflow-hidden">
              <summary className="p-4 text-sm font-medium text-gray-300 cursor-pointer hover:text-white select-none">
                Raw Policy JSON
              </summary>
              <div className="border-t border-surface-300 p-4">
                <pre
                  className="text-xs font-mono text-gray-300 overflow-x-auto leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: syntaxHighlight(JSON.stringify(state.policy, null, 2)),
                  }}
                />
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "json-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/true|false/.test(match)) {
        cls = "json-boolean";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

"use client";

import { useState, useEffect } from "react";
import { Shield, ArrowRight, Zap, Lock, Globe, ChevronDown, Loader2, AlertCircle } from "lucide-react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import Navbar from "./components/Navbar";
import PolicyEditor from "./components/PolicyEditor";
import PolicyCard from "./components/PolicyCard";
import PublishPanel from "./components/PublishPanel";
import type { AllowancePolicy } from "@/lib/policySchema";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.sepolia.org"),
});

// Queries the chain directly — no hardcoded names.
// 1. Reverse ENS lookup for the wallet's primary name.
// 2. ENS Sepolia subgraph for any additional owned names.
async function lookupEnsNames(address: string): Promise<string[]> {
  const found = new Set<string>();

  // Reverse resolution — what primary name has this address set?
  try {
    const primary = await publicClient.getEnsName({ address: address as `0x${string}` });
    if (primary && primary.includes(".")) found.add(primary);
  } catch {}

  // Subgraph — names owned by this address
  try {
    const res = await fetch(
      "https://api.studio.thegraph.com/query/49574/enssepolia/version/latest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `{ domains(where: { owner: "${address.toLowerCase()}" }) { name } }`,
        }),
      }
    );
    const data = await res.json();
    for (const d of (data?.data?.domains ?? []) as { name: string }[]) {
      const n = d.name;
      if (n && !n.includes(".addr.reverse") && !/^\[[\da-f]{64}\]/.test(n))
        found.add(n);
    }
  } catch {}

  return Array.from(found).sort();
}

interface EnsOption {
  name: string;
  isSubname: boolean;
}

function parseEnsOptions(names: string[]): EnsOption[] {
  return names.map((name) => ({
    name,
    isSubname: name.split(".").length > 2,
  }));
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Main page ───────────────────────────────────────────────

export default function Home() {
  const { primaryWallet } = useDynamicContext();
  const [mounted, setMounted] = useState(false);
  const [policy, setPolicy] = useState<AllowancePolicy | null>(null);
  const [ensName, setEnsName] = useState("");
  const [ensOptions, setEnsOptions] = useState<EnsOption[]>([]);
  const [ensLoading, setEnsLoading] = useState(false);
  const [ensResolved, setEnsResolved] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNoEnsModal, setShowNoEnsModal] = useState(false);

  useEffect(() => setMounted(true), []);

  // Resolve ENS names when wallet connects
  useEffect(() => {
    if (!primaryWallet?.address) {
      setEnsOptions([]);
      setEnsName("");
      setEnsResolved(false);
      return;
    }
    setEnsLoading(true);
    setEnsResolved(false);
    lookupEnsNames(primaryWallet.address).then((names) => {
      const options = parseEnsOptions(names);
      setEnsOptions(options);
      setEnsLoading(false);
      setEnsResolved(true);
      if (options.length === 0) setShowNoEnsModal(true);
      else setEnsName(options[0].name);
    });
  }, [primaryWallet?.address]);

  const selectedOption = ensOptions.find((o) => o.name === ensName);
  const connectedWallet = mounted ? primaryWallet : null;

  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-600/15 border border-brand-500/30 text-brand-300 text-xs font-medium mb-6">
            <Zap className="w-3 h-3" />
            ENS · PolicyGuard · ERC-7730 Clear Signing
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
            Spending rules that travel{" "}
            <span
              className="text-transparent bg-clip-text"
              style={{
                backgroundImage: "linear-gradient(135deg, #a78bff 0%, #7c3aed 50%, #06b6d4 100%)",
              }}
            >
              with your agent
            </span>
          </h1>

          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Define what your AI agent is allowed to spend — in plain English.
            Published to ENS. Enforced on-chain. Move the name, move the rules.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 mb-14">
          {[
            { icon: Globe, label: "Stored on ENS" },
            { icon: Lock, label: "On-chain enforcement" },
            { icon: Shield, label: "Ledger Clear Signing" },
            { icon: Zap, label: "AI-assisted authoring" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-100 border border-surface-300 text-gray-400 text-xs"
            >
              <Icon className="w-3 h-3 text-brand-400" />
              {label}
            </div>
          ))}
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left — Editor */}
          <div className="lg:col-span-2 space-y-5">

            {/* ENS name selector */}
            <div className="card p-5">
              <label className="label mb-2 block">Agent ENS name</label>

              {!connectedWallet ? (
                // Not connected
                <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-200/50 border border-surface-300 text-sm text-gray-500">
                  Connect your wallet to load ENS names
                </div>
              ) : ensLoading ? (
                // Resolving
                <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-200/50 border border-surface-300">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-400 flex-shrink-0" />
                  <span className="text-sm text-gray-400">Resolving ENS names…</span>
                </div>
              ) : ensResolved && ensOptions.length === 0 ? (
                // Resolved but nothing found — disabled
                <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger cursor-not-allowed">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  No ENS name found for this wallet
                </div>
              ) : (
                // Connected with ENS names — dropdown picker
                <div className="space-y-2">
                  <div className="relative">
                    <button
                      className="w-full flex items-center justify-between input-field text-left"
                      onClick={() => setShowDropdown((v) => !v)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {selectedOption ? (
                          <>
                            <span className="font-mono text-sm text-white truncate">
                              {selectedOption.name}
                            </span>
                            <span className={`badge flex-shrink-0 ${selectedOption.isSubname ? "badge-info" : "badge-muted"}`}>
                              {selectedOption.isSubname ? "subname" : "parent"}
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-500 text-sm font-mono">
                            Default ({truncateAddress(connectedWallet?.address ?? "")})
                          </span>
                        )}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
                    </button>

                    {showDropdown && (
                      <div className="absolute z-20 mt-1 w-full card border border-surface-400/50 shadow-glow-sm overflow-hidden">
                        {/* Group by type */}
                        {["parent", "subname"].map((type) => {
                          const group = ensOptions.filter((o) =>
                            type === "subname" ? o.isSubname : !o.isSubname
                          );
                          if (group.length === 0) return null;
                          return (
                            <div key={type}>
                              <p className="px-3 pt-2 pb-1 text-[10px] font-medium text-gray-600 uppercase tracking-wider">
                                {type === "subname" ? "Subnames" : "Parent names"}
                              </p>
                              {group.map((option) => (
                                <button
                                  key={option.name}
                                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-300/50 transition-colors ${
                                    ensName === option.name ? "bg-brand-600/15" : ""
                                  }`}
                                  onClick={() => {
                                    setEnsName(option.name);
                                    setShowDropdown(false);
                                  }}
                                >
                                  <span className="font-mono text-sm text-white flex-1 truncate">
                                    {option.name}
                                  </span>
                                  <span className={`badge flex-shrink-0 ${option.isSubname ? "badge-info" : "badge-muted"}`}>
                                    {option.isSubname ? "subname" : "parent"}
                                  </span>
                                </button>
                              ))}
                            </div>
                          );
                        })}

                        {/* Manual entry option */}
                        <div className="border-t border-surface-300 px-3 py-2">
                          <p className="text-[10px] text-gray-600 mb-1">Or type a name manually</p>
                          <input
                            className="input-field text-xs py-1.5"
                            placeholder="custom.eth"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEnsName(e.target.value)}
                            value={ensOptions.find((o) => o.name === ensName) ? "" : ensName}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-600">
                    {selectedOption?.isSubname
                      ? "Subname — ideal for isolating a single agent's policy under your parent name."
                      : "Parent name — policy applies to the root ENS name."}
                  </p>
                </div>
              )}
            </div>

            {/* Policy editor */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white">Policy Authoring</h2>
                <span className="badge badge-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                  allowance.policy.v1
                </span>
              </div>
              <PolicyEditor value={policy} onChange={setPolicy} />
            </div>
          </div>

          {/* Right — Publish + Preview */}
          <div className="space-y-5">
            <PublishPanel policy={policy} ensName={ensName} />

            {policy && (
              <div>
                <p className="label mb-2">Preview</p>
                <PolicyCard policy={policy} ensName={ensName} />
              </div>
            )}

            <div className="card p-4 border-brand-700/40">
              <p className="label mb-3">How it works</p>
              <div className="space-y-3">
                {[
                  { step: "1", text: "Author policy in English or JSON" },
                  { step: "2", text: "AI translates → validates against schema" },
                  { step: "3", text: "JSON → ENS text record" },
                  { step: "4", text: "keccak256 hash → PolicyGuard.sol" },
                  { step: "5", text: "Every agent tx calls check() on-chain" },
                ].map(({ step, text }) => (
                  <div key={step} className="flex items-start gap-2.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-600/20 border border-brand-500/30 text-brand-300 text-xs flex items-center justify-center font-medium">
                      {step}
                    </span>
                    <p className="text-xs text-gray-400 pt-0.5">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* No ENS modal */}
      {showNoEnsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNoEnsModal(false)} />
          <div className="relative card p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/15 border border-danger/30 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-white">No ENS name found</p>
                <p className="text-xs text-gray-500 mt-0.5">Checked reverse resolution and subgraph</p>
              </div>
            </div>
            <p className="text-sm text-gray-400">
              This wallet has no ENS name on Sepolia. To use Allowance.eth you need an ENS name — register one at{" "}
              <a href="https://explorer.ens.dev" target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:text-brand-200 underline">
                explorer.ens.dev
              </a>{" "}
              and then try again.
            </p>
            <button
              className="btn-secondary w-full justify-center"
              onClick={() => setShowNoEnsModal(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-surface-300/40 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-600">
            Built with ENS · Dynamic · Ledger Clear Signing · Anthropic Claude
          </p>
          <div className="flex items-center gap-4">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-brand-300 transition-colors flex items-center gap-1">
              GitHub <ArrowRight className="w-3 h-3" />
            </a>
            <a href="/profile"
              className="text-xs text-gray-500 hover:text-brand-300 transition-colors flex items-center gap-1">
              ENS Profile <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

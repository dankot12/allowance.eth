"use client";

import { useState, useEffect, useRef } from "react";
import { Shield, ArrowRight, Zap, Lock, Globe, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { publicClient, ENS_PUBLIC_RESOLVER, RESOLVER_ABI } from "@/lib/ensClient";
import { namehash } from "viem";
import Navbar from "./components/Navbar";
import PolicyEditor from "./components/PolicyEditor";
import PolicyCard from "./components/PolicyCard";
import PublishPanel from "./components/PublishPanel";
import type { AllowancePolicy } from "@/lib/policySchema";

// Forward resolution: addr(namehash(name)) on the configured resolver.
// Works for CCIP-Read names (like traderbot.eth) where reverse lookup fails.
async function resolveEnsToAddress(name: string): Promise<string | null> {
  try {
    const node = namehash(name);
    const addr = await publicClient.readContract({
      address: ENS_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "addr",
      args: [node],
    });
    return (addr as string) || null;
  } catch {
    return null;
  }
}

// ─── Main page ───────────────────────────────────────────────

type VerifyStatus = "idle" | "checking" | "valid" | "invalid";

export default function Home() {
  const { primaryWallet } = useDynamicContext();
  const [mounted, setMounted] = useState(false);
  const [policy, setPolicy] = useState<AllowancePolicy | null>(null);
  const [ensName, setEnsName] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  // Forward-verify the typed name: addr(namehash(name)) must match wallet
  useEffect(() => {
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
    const wallet = primaryWallet?.address;
    if (!wallet || !ensName.includes(".")) {
      setVerifyStatus("idle");
      return;
    }
    setVerifyStatus("checking");
    verifyTimer.current = setTimeout(async () => {
      const resolved = await resolveEnsToAddress(ensName);
      if (resolved && resolved.toLowerCase() === wallet.toLowerCase()) {
        setVerifyStatus("valid");
      } else {
        setVerifyStatus("invalid");
      }
    }, 600);
    return () => { if (verifyTimer.current) clearTimeout(verifyTimer.current); };
  }, [ensName, primaryWallet?.address]);

  // On wallet connect, pre-fill suggestions from localStorage + try reverse lookup
  useEffect(() => {
    if (!primaryWallet?.address) {
      setEnsName("");
      setSuggestions([]);
      setVerifyStatus("idle");
      return;
    }
    // Load previously verified names from localStorage
    const stored = JSON.parse(localStorage.getItem("ens_suggestions") || "[]") as string[];
    setSuggestions(stored);
    // Try reverse resolution as a bonus — won't work for CCIP names but fine if it does
    publicClient.getEnsName({ address: primaryWallet.address as `0x${string}` })
      .then((n) => {
        if (n && n.includes(".")) {
          setSuggestions((prev) => Array.from(new Set([n, ...prev])));
          if (!ensName) setEnsName(n);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryWallet?.address]);

  // Persist verified names to localStorage
  useEffect(() => {
    if (verifyStatus === "valid" && ensName) {
      setSuggestions((prev) => {
        const next = Array.from(new Set([ensName, ...prev])).slice(0, 10);
        localStorage.setItem("ens_suggestions", JSON.stringify(next));
        return next;
      });
    }
  }, [verifyStatus, ensName]);

  const connectedWallet = mounted ? primaryWallet : null;
  const isSubname = ensName.split(".").length > 2;

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

            {/* ENS name input */}
            <div className="card p-5">
              <label className="label mb-2 block">Agent ENS name</label>
              <div className="relative">
                <input
                  ref={inputRef}
                  className="input-field font-mono pr-10"
                  placeholder="yourname.eth"
                  value={ensName}
                  disabled={!connectedWallet}
                  onChange={(e) => {
                    setEnsName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {verifyStatus === "checking" && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
                  {verifyStatus === "valid" && <CheckCircle2 className="w-4 h-4 text-success" />}
                  {verifyStatus === "invalid" && <AlertCircle className="w-4 h-4 text-danger" />}
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full card border border-surface-400/50 shadow-glow-sm overflow-hidden">
                    {suggestions.map((s) => {
                      const sub = s.split(".").length > 2;
                      return (
                        <button
                          key={s}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-300/50 transition-colors ${ensName === s ? "bg-brand-600/15" : ""}`}
                          onMouseDown={() => { setEnsName(s); setShowSuggestions(false); }}
                        >
                          <span className="font-mono text-sm text-white flex-1 truncate">{s}</span>
                          <span className={`badge flex-shrink-0 ${sub ? "badge-info" : "badge-muted"}`}>
                            {sub ? "subname" : "parent"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className={`text-xs mt-1.5 ${verifyStatus === "invalid" ? "text-danger" : "text-gray-600"}`}>
                {!connectedWallet
                  ? "Connect your wallet first."
                  : verifyStatus === "checking"
                  ? "Verifying name resolves to your wallet…"
                  : verifyStatus === "valid"
                  ? (isSubname ? "✓ Subname verified — policy scoped to this agent." : "✓ Name verified — resolves to your wallet.")
                  : verifyStatus === "invalid"
                  ? "This name doesn't resolve to your connected wallet."
                  : "Type your ENS name (e.g. traderbot.eth)"}
              </p>
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

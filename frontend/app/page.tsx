"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, Loader2, CheckCircle2, AlertCircle, Lock, Zap, RefreshCw, ChevronRight } from "lucide-react";
import { useDynamicContext, DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { publicClient, ENS_PUBLIC_RESOLVER, RESOLVER_ABI } from "@/lib/ensClient";
import { namehash } from "viem";
import Navbar from "./components/Navbar";
import PolicyEditor from "./components/PolicyEditor";
import PublishPanel from "./components/PublishPanel";
import AgentSimulator from "./components/AgentSimulator";
import PolicyDiff from "./components/PolicyDiff";
import type { AllowancePolicy } from "@/lib/policySchema";

const SAVED_NAMES_KEY = "allowance_ens_names";

function getSavedNames(): string[] {
  try { return JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) || "[]") as string[]; }
  catch { return []; }
}

function addSavedName(name: string) {
  const names = Array.from(new Set([name, ...getSavedNames()])).slice(0, 10);
  localStorage.setItem(SAVED_NAMES_KEY, JSON.stringify(names));
  return names;
}

async function resolveEnsToAddress(name: string): Promise<string | null> {
  try {
    const addr = await publicClient.readContract({
      address: ENS_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "addr",
      args: [namehash(name)],
    });
    return (addr as string) || null;
  } catch { return null; }
}

type VerifyStatus = "idle" | "checking" | "valid" | "invalid";

// ── Hero (not connected) ────────────────────────────────────────────────────

function Hero() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 text-center">
      {/* Vault icon */}
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-2xl bg-surface-50 border border-brand-600/40 flex items-center justify-center"
          style={{ boxShadow: "0 0 40px rgba(16,185,129,0.2), inset 0 1px 0 rgba(16,185,129,0.1)" }}>
          <Shield className="w-10 h-10 text-brand-400" />
        </div>
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-500 border-2 border-[#070d0b]"
          style={{ boxShadow: "0 0 8px rgba(16,185,129,0.8)" }} />
      </div>

      {/* Headline */}
      <div className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-medium tracking-wide uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
        Sepolia Testnet · EthGlobal NYC 2026
      </div>

      <h1 className="text-4xl sm:text-6xl font-bold text-white mb-5 leading-tight tracking-tight max-w-3xl">
        Spending guardrails
        <br />
        <span style={{
          backgroundImage: "linear-gradient(135deg, #34d399 0%, #10b981 50%, #06b6d4 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          for AI agents.
        </span>
      </h1>

      <p className="text-gray-400 text-lg max-w-xl mb-10 leading-relaxed">
        Define what your AI agent is allowed to spend — daily caps, allowlists, time windows.
        The rules live on its <span className="text-brand-400 font-mono">ENS name</span> and travel with the agent across wallets.
        High-value transactions require your <span className="text-gray-300">Ledger</span> to sign off.
      </p>

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mb-12 text-left">
        {[
          {
            icon: <Zap className="w-4 h-4 text-brand-400" />,
            title: "Write rules in English",
            desc: "Claude converts plain English into a verified spending policy JSON stored on ENS.",
          },
          {
            icon: <Shield className="w-4 h-4 text-brand-400" />,
            title: "Enforced on-chain",
            desc: "PolicyGuard verifies every agent transaction against the policy before it broadcasts.",
          },
          {
            icon: <Lock className="w-4 h-4 text-brand-400" />,
            title: "Ledger for big spends",
            desc: "Anything above the approval threshold requires a Ledger signature with ERC-7730 clear signing.",
          },
        ].map((f) => (
          <div key={f.title} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                {f.icon}
              </div>
              <span className="text-sm font-semibold text-white">{f.title}</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Connect CTA */}
      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-gray-600 uppercase tracking-wider font-medium">Connect your wallet to get started</p>
        <DynamicWidget />
      </div>
    </div>
  );
}

// ── Workspace (connected) ────────────────────────────────────────────────────

export default function Home() {
  const { primaryWallet } = useDynamicContext();
  const [mounted, setMounted] = useState(false);
  const [policy, setPolicy] = useState<AllowancePolicy | null>(null);
  const [ensName, setEnsName] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => { setSavedNames(getSavedNames()); }, []);

  useEffect(() => {
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
    const wallet = primaryWallet?.address;
    if (!wallet || !ensName.includes(".")) { setVerifyStatus("idle"); return; }
    setVerifyStatus("checking");
    verifyTimer.current = setTimeout(async () => {
      const resolved = await resolveEnsToAddress(ensName);
      setVerifyStatus(resolved && resolved.toLowerCase() === wallet.toLowerCase() ? "valid" : "invalid");
    }, 600);
    return () => { if (verifyTimer.current) clearTimeout(verifyTimer.current); };
  }, [ensName, primaryWallet?.address]);

  useEffect(() => {
    if (!primaryWallet?.address) { setEnsName(""); setVerifyStatus("idle"); return; }
    const names = getSavedNames();
    setSavedNames(names);
    if (!ensName && names.length > 0) setEnsName(names[0]);
    publicClient.getEnsName({ address: primaryWallet.address as `0x${string}` })
      .then((n) => { if (n?.includes(".")) setSavedNames((prev) => Array.from(new Set([n, ...prev]))); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryWallet?.address]);

  const handlePublished = useCallback((name: string) => {
    setSavedNames(addSavedName(name));
  }, []);

  const connectedWallet = mounted ? primaryWallet : null;

  if (!connectedWallet) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <Hero />
      </div>
    );
  }

  const ensReady = verifyStatus === "valid";

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* ENS identity bar */}
      <div className="border-b border-surface-300/40 bg-surface-50/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Agent ENS Name</p>
            </div>
            <div className="relative flex-1 max-w-sm">
              <input
                list="ens-saved-names"
                className="input-field font-mono pr-10 py-2 text-sm"
                placeholder="traderbot.eth"
                value={ensName}
                onChange={(e) => setEnsName(e.target.value)}
              />
              <datalist id="ens-saved-names">
                {savedNames.map((n) => <option key={n} value={n} />)}
              </datalist>
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {verifyStatus === "checking" && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
                {verifyStatus === "valid"    && <CheckCircle2 className="w-4 h-4 text-brand-400" />}
                {verifyStatus === "invalid"  && <AlertCircle  className="w-4 h-4 text-danger" />}
              </div>
            </div>
            {verifyStatus === "invalid" && (
              <p className="text-xs text-danger">This name doesn&apos;t resolve to your wallet.</p>
            )}
            {verifyStatus === "valid" && (
              <p className="text-xs text-brand-500">Verified ✓</p>
            )}
            {!ensName && (
              <p className="text-xs text-gray-600">Enter the ENS name your agent uses.</p>
            )}
          </div>
        </div>
      </div>

      {/* Workspace */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {!ensReady && (
          <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-surface-300 bg-surface-50/60">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-brand-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Enter your agent&apos;s ENS name above to continue</p>
              <p className="text-xs text-gray-500 mt-0.5">The spending policy is anchored to the ENS name — it travels with the agent identity, not the wallet.</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 ml-auto flex-shrink-0" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left — policy editor */}
          <div className="lg:col-span-2 space-y-5">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-semibold text-white text-base">Spending Policy</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Describe the rules in plain English — Claude converts it to a verified policy JSON stored on ENS.</p>
                </div>
                <span className="badge badge-muted font-mono text-xs">
                  allowance.policy.v1
                </span>
              </div>
              <PolicyEditor value={policy} onChange={setPolicy} />
            </div>

            {ensName && <PolicyDiff ensName={ensName} localPolicy={policy} />}
          </div>

          {/* Right — publish + simulate */}
          <div className="space-y-5">
            {/* Status summary */}
            <div className="card p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Status</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">ENS name</span>
                  {ensReady
                    ? <span className="text-brand-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verified</span>
                    : <span className="text-gray-600">Not set</span>}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Policy</span>
                  {policy
                    ? <span className="text-brand-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Valid JSON</span>
                    : <span className="text-gray-600">Not ready</span>}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Network</span>
                  <span className="text-warning flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                    Sepolia
                  </span>
                </div>
              </div>
            </div>

            <PublishPanel policy={policy} ensName={ensName} onPublished={handlePublished} />
            <AgentSimulator ensName={ensName} policy={policy} />
          </div>
        </div>
      </section>

      <footer className="border-t border-surface-300/30 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            ENS · Dynamic · Ledger ERC-7730 · Anthropic Claude · PolicyGuard
          </p>
          <a href="/agent" className="text-xs text-gray-600 hover:text-brand-400 transition-colors flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            Agent Log
          </a>
        </div>
      </footer>
    </div>
  );
}

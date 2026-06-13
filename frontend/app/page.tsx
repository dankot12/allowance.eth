"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, Zap, Lock, Globe, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { publicClient, ENS_PUBLIC_RESOLVER, RESOLVER_ABI } from "@/lib/ensClient";
import { namehash } from "viem";
import Navbar from "./components/Navbar";
import PolicyEditor from "./components/PolicyEditor";
import PolicyCard from "./components/PolicyCard";
import PublishPanel from "./components/PublishPanel";
import AgentSimulator from "./components/AgentSimulator";
import PolicyDiff from "./components/PolicyDiff";
import DeployChecklist from "./components/DeployChecklist";
import type { AllowancePolicy } from "@/lib/policySchema";

const SAVED_NAMES_KEY = "allowance_ens_names";

function getSavedNames(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function addSavedName(name: string) {
  const names = Array.from(new Set([name, ...getSavedNames()])).slice(0, 10);
  localStorage.setItem(SAVED_NAMES_KEY, JSON.stringify(names));
  return names;
}

// Forward-verify: addr(namehash(name)) on the CCIP resolver must match wallet
async function resolveEnsToAddress(name: string): Promise<string | null> {
  try {
    const addr = await publicClient.readContract({
      address: ENS_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "addr",
      args: [namehash(name)],
    });
    return (addr as string) || null;
  } catch {
    return null;
  }
}

type VerifyStatus = "idle" | "checking" | "valid" | "invalid";

export default function Home() {
  const { primaryWallet } = useDynamicContext();
  const [mounted, setMounted] = useState(false);
  const [policy, setPolicy] = useState<AllowancePolicy | null>(null);
  const [ensName, setEnsName] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [lastPublishedJson, setLastPublishedJson] = useState("");
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Load saved names on mount
  useEffect(() => {
    setSavedNames(getSavedNames());
  }, []);

  // Forward-verify on name change
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
      setVerifyStatus(
        resolved && resolved.toLowerCase() === wallet.toLowerCase() ? "valid" : "invalid"
      );
    }, 600);
    return () => { if (verifyTimer.current) clearTimeout(verifyTimer.current); };
  }, [ensName, primaryWallet?.address]);

  // On wallet connect, pre-fill first saved name
  useEffect(() => {
    if (!primaryWallet?.address) {
      setEnsName("");
      setVerifyStatus("idle");
      return;
    }
    const names = getSavedNames();
    setSavedNames(names);
    if (!ensName && names.length > 0) setEnsName(names[0]);
    // Background reverse lookup bonus
    publicClient.getEnsName({ address: primaryWallet.address as `0x${string}` })
      .then((n) => { if (n?.includes(".")) setSavedNames((prev) => Array.from(new Set([n, ...prev]))); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryWallet?.address]);

  const handlePublished = useCallback((name: string) => {
    const updated = addSavedName(name);
    setSavedNames(updated);
    setLastPublishedJson(policy ? JSON.stringify(policy) : "");
    setChecklistOpen(true);
  }, [policy]);

  const connectedWallet = mounted ? primaryWallet : null;

  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-12">
        {/* Compact header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-600/15 border border-brand-500/30 text-brand-300 text-xs font-medium">
            <Zap className="w-3 h-3" />
            ENS · PolicyGuard · ERC-7730 · Dynamic
          </div>
          <div className="flex items-center gap-3 ml-auto">
            {[
              { icon: Globe, label: "ENS" },
              { icon: Lock, label: "On-chain" },
              { icon: Shield, label: "Ledger" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="hidden sm:flex items-center gap-1 text-gray-600 text-xs">
                <Icon className="w-3 h-3 text-brand-500" />
                {label}
              </div>
            ))}
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
          Spending rules that travel{" "}
          <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(135deg, #a78bff 0%, #7c3aed 50%, #06b6d4 100%)" }}>
            with your agent
          </span>
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          Define what your AI agent can spend. Published to ENS. Enforced on-chain. Move the name, move the rules.
        </p>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Left — ENS name + editor */}
          <div className="lg:col-span-2 space-y-4">

            {/* ENS name */}
            <div className="card p-4">
              <label className="label mb-2 block">Agent ENS name</label>
              <div className="relative">
                <input
                  list="ens-saved-names"
                  className="input-field font-mono pr-10"
                  placeholder="yourname.eth"
                  value={ensName}
                  disabled={!connectedWallet}
                  onChange={(e) => setEnsName(e.target.value)}
                />
                <datalist id="ens-saved-names">
                  {savedNames.map((n) => <option key={n} value={n} />)}
                </datalist>
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {verifyStatus === "checking" && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
                  {verifyStatus === "valid"    && <CheckCircle2 className="w-4 h-4 text-success" />}
                  {verifyStatus === "invalid"  && <AlertCircle  className="w-4 h-4 text-danger" />}
                </div>
              </div>
              <p className={`text-xs mt-1 ${verifyStatus === "invalid" ? "text-danger" : "text-gray-600"}`}>
                {!connectedWallet
                  ? "Connect your wallet first."
                  : verifyStatus === "checking" ? "Verifying…"
                  : verifyStatus === "valid"    ? "✓ Resolves to your wallet."
                  : verifyStatus === "invalid"  ? "This name doesn't resolve to your wallet."
                  : savedNames.length > 0       ? "Select a saved name or type a new one."
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

            <PolicyDiff ensName={ensName} localPolicy={policy} />
          </div>

          {/* Right — publish + simulate + preview */}
          <div className="space-y-4">
            <PublishPanel policy={policy} ensName={ensName} onPublished={handlePublished} />

            <AgentSimulator ensName={ensName} policy={policy} />

            {policy && (
              <div>
                <p className="label mb-2">Preview</p>
                <PolicyCard policy={policy} ensName={ensName} />
              </div>
            )}
          </div>
        </div>
      </section>

      <DeployChecklist
        ensName={ensName}
        policyJson={lastPublishedJson}
        isOpen={checklistOpen}
        onClose={() => setChecklistOpen(false)}
      />

      <footer className="border-t border-surface-300/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            Built with ENS · Dynamic · Ledger Clear Signing · Anthropic Claude
          </p>
          <a
            href="/agent"
            className="text-xs text-gray-500 hover:text-brand-300 transition-colors"
          >
            Agent Activity Log →
          </a>
        </div>
      </footer>
    </div>
  );
}

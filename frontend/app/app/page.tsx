"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, Loader2, CheckCircle2, AlertCircle, ChevronRight, RefreshCw } from "lucide-react";
import { useDynamicContext, DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { publicClient, ENS_PUBLIC_RESOLVER, RESOLVER_ABI } from "@/lib/ensClient";
import { namehash } from "viem";
import Navbar from "../components/Navbar";
import PolicyEditor from "../components/PolicyEditor";
import PublishPanel from "../components/PublishPanel";
import PolicyDiff from "../components/PolicyDiff";
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

export default function AppPage() {
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
  const ensReady = verifyStatus === "valid";

  if (!connectedWallet) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 text-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-surface-50 border border-brand-600/30 flex items-center justify-center"
            style={{ boxShadow: "0 0 30px rgba(16,185,129,0.15)" }}>
            <Shield className="w-7 h-7 text-brand-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Connect your wallet</h2>
            <p className="text-sm text-gray-500">You need a connected wallet to manage spending policies.</p>
          </div>
          <DynamicWidget />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* ENS identity bar */}
      <div className="border-b border-surface-300/40 bg-surface-50/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider flex-shrink-0">Agent ENS Name</p>
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
            {verifyStatus === "invalid" && <p className="text-xs text-danger">This name doesn&apos;t resolve to your wallet.</p>}
            {verifyStatus === "valid"   && <p className="text-xs text-brand-500">Verified ✓</p>}
            {!ensName                  && <p className="text-xs text-gray-600">Enter the ENS name your agent uses.</p>}
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
          <div className="lg:col-span-2 space-y-5">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-semibold text-white text-base">Spending Policy</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Describe the rules in plain English — Claude converts it to a verified policy JSON stored on ENS.</p>
                </div>
                <span className="badge badge-muted font-mono text-xs">allowance.policy.v1</span>
              </div>
              <PolicyEditor value={policy} onChange={setPolicy} />
            </div>
            {ensName && <PolicyDiff ensName={ensName} localPolicy={policy} />}
          </div>

          <div className="space-y-5">
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
          </div>
        </div>
      </section>

      <footer className="border-t border-surface-300/30 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <p className="text-xs text-gray-600">ENS · Dynamic · Ledger ERC-7730 · Anthropic Claude · PolicyGuard</p>
          <a href="/agent" className="text-xs text-gray-600 hover:text-brand-400 transition-colors flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Agent Log
          </a>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2, X, Shield, ExternalLink } from "lucide-react";
import { namehash } from "viem";
import {
  publicClient,
  fetchPolicyFromENS,
  computePolicyHash,
  POLICY_GUARD_ADDRESS,
  POLICY_GUARD_ABI,
} from "@/lib/ensClient";

// ─── Types ────────────────────────────────────────────────────

type CheckStatus = "pending" | "running" | "pass" | "fail" | "info";

interface CheckItem {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  detail?: string;
}

// ─── Component ────────────────────────────────────────────────

interface Props {
  ensName: string;
  policyJson: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function DeployChecklist({ ensName, policyJson, isOpen, onClose }: Props) {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [done, setDone] = useState(false);

  const setCheck = (id: string, patch: Partial<CheckItem>) =>
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  useEffect(() => {
    if (!isOpen || !ensName.includes(".")) return;

    const initial: CheckItem[] = [
      { id: "ens",     label: "ENS text record",       description: "Policy JSON stored at allowance.policy.v1", status: "pending" },
      { id: "guard",   label: "PolicyGuard hash",       description: "keccak256 hash matches on-chain",          status: "pending" },
      { id: "owner",   label: "Policy owner",           description: "Ownership registered in PolicyGuard",       status: "pending" },
      { id: "erc7730", label: "ERC-7730 descriptor",    description: "Clear signing ready for Ledger",            status: "info",
        detail: "eip7730/PolicyGuard.json — submit to Ledger's registry for production." },
    ];
    setChecks(initial);
    setDone(false);

    runChecks(ensName, policyJson, setCheck).then(() => setDone(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ensName]);

  if (!isOpen) return null;

  const passing = checks.filter((c) => c.status === "pass" || c.status === "info").length;
  const total   = checks.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md card p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-400" />
              Deployment Checklist
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{ensName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-300/50 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Progress */}
        {checks.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-300/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${(passing / total) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 tabular-nums">{passing}/{total}</span>
          </div>
        )}

        {/* Checks */}
        <div className="space-y-2">
          {checks.map((check) => (
            <div
              key={check.id}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                check.status === "pass"    ? "bg-success/10 border-success/20"
                : check.status === "fail"  ? "bg-danger/10  border-danger/20"
                : check.status === "info"  ? "bg-brand-600/10 border-brand-500/20"
                : check.status === "running" ? "bg-surface-200/50 border-surface-300/30"
                : "bg-surface-100/30 border-surface-300/20"
              }`}
            >
              <div className="mt-0.5 flex-shrink-0">
                {check.status === "running" && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
                {check.status === "pass"    && <CheckCircle2 className="w-4 h-4 text-success" />}
                {check.status === "fail"    && <XCircle      className="w-4 h-4 text-danger" />}
                {check.status === "info"    && <CheckCircle2 className="w-4 h-4 text-brand-400" />}
                {check.status === "pending" && <div className="w-4 h-4 rounded-full border border-surface-400/50" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${
                  check.status === "pass"  ? "text-success"
                  : check.status === "fail"  ? "text-danger"
                  : check.status === "info"  ? "text-brand-300"
                  : "text-gray-300"
                }`}>
                  {check.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{check.description}</p>
                {check.detail && (
                  <p className="text-xs text-gray-600 mt-1 italic">{check.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-surface-300/30">
          <a
            href={`https://sepolia.etherscan.io/address/${POLICY_GUARD_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            PolicyGuard on Etherscan
          </a>
          <button
            className="btn-primary py-1.5 px-4 text-sm"
            onClick={onClose}
            disabled={!done}
          >
            {done ? "Done" : <Loader2 className="w-4 h-4 animate-spin" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Async check runner ───────────────────────────────────────

async function runChecks(
  ensName: string,
  policyJson: string,
  setCheck: (id: string, patch: Partial<CheckItem>) => void
) {
  const node = namehash(ensName);

  // Check 1 — ENS text record
  setCheck("ens", { status: "running" });
  try {
    const live = await fetchPolicyFromENS(ensName);
    if (live) {
      setCheck("ens", {
        status: "pass",
        detail: `${live.length} chars · key: allowance.policy.v1`,
      });
    } else {
      setCheck("ens", {
        status: "fail",
        detail: "No record found. Set the text record via the ENS App or publish again.",
      });
    }
  } catch {
    setCheck("ens", { status: "fail", detail: "Could not read ENS record." });
  }

  // Check 2 — PolicyGuard hash
  setCheck("guard", { status: "running" });
  try {
    const onChainHash = await publicClient.readContract({
      address: POLICY_GUARD_ADDRESS,
      abi: POLICY_GUARD_ABI,
      functionName: "getPolicyHash",
      args: [node],
    }) as `0x${string}`;

    const localHash = computePolicyHash(policyJson);
    const isZero    = onChainHash === "0x0000000000000000000000000000000000000000000000000000000000000000";

    if (isZero) {
      setCheck("guard", {
        status: "fail",
        detail: "No hash registered. Click 'Register policy hash on-chain' in the simulator.",
      });
    } else if (onChainHash.toLowerCase() === localHash.toLowerCase()) {
      setCheck("guard", {
        status: "pass",
        detail: `${onChainHash.slice(0, 18)}…`,
      });
    } else {
      setCheck("guard", {
        status: "fail",
        detail: `Hash mismatch — on-chain: ${onChainHash.slice(0, 12)}… local: ${localHash.slice(0, 12)}…`,
      });
    }
  } catch {
    setCheck("guard", { status: "fail", detail: "Could not read PolicyGuard." });
  }

  // Check 3 — Policy owner
  setCheck("owner", { status: "running" });
  try {
    const owner = await publicClient.readContract({
      address: POLICY_GUARD_ADDRESS,
      abi: POLICY_GUARD_ABI,
      functionName: "policyOwners",
      args: [node],
    }) as string;

    const isZero = owner === "0x0000000000000000000000000000000000000000";
    setCheck("owner", {
      status: isZero ? "fail" : "pass",
      detail: isZero ? "Not set — publish to register ownership." : `${owner.slice(0, 10)}…${owner.slice(-6)}`,
    });
  } catch {
    setCheck("owner", { status: "fail", detail: "Could not read policy owner." });
  }

  // Check 4 — ERC-7730 (static info)
  // Already set as "info" in initial state — no async needed
}

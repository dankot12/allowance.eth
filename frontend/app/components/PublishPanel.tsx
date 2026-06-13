"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, ExternalLink, Loader2, Copy, Check, RefreshCw } from "lucide-react";
import type { AllowancePolicy } from "@/lib/policySchema";
import { computePolicyHash, fetchPolicyFromENS } from "@/lib/ensClient";

interface PublishPanelProps {
  policy: AllowancePolicy | null;
  ensName: string;
}

type VerifyState = "idle" | "checking" | "found" | "not-found";

export default function PublishPanel({ policy, ensName }: PublishPanelProps) {
  const [copied, setCopied] = useState(false);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [livePolicy, setLivePolicy] = useState<string | null>(null);

  const policyJson = policy ? JSON.stringify(policy, null, 2) : null;
  const policyHash = policy ? computePolicyHash(JSON.stringify(policy)) : null;
  const canAct = !!policy && !!ensName.trim();

  // Reset verify state when policy or name changes
  useEffect(() => {
    setVerifyState("idle");
    setLivePolicy(null);
  }, [policy, ensName]);

  const copyJson = () => {
    if (!policyJson) return;
    navigator.clipboard.writeText(JSON.stringify(policy)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const verify = async () => {
    if (!ensName.trim()) return;
    setVerifyState("checking");
    const raw = await fetchPolicyFromENS(ensName);
    if (raw) {
      setLivePolicy(raw);
      setVerifyState("found");
    } else {
      setLivePolicy(null);
      setVerifyState("not-found");
    }
  };

  const ensExplorerUrl = ensName
    ? `https://explorer.ens.dev/${ensName}`
    : "https://explorer.ens.dev";

  return (
    <div className="card p-5 space-y-4">
      <h3 className="font-semibold text-white">Publish to ENS</h3>

      {/* Target name */}
      <div className="p-3 rounded-xl bg-surface-200/50 border border-surface-300/50 space-y-1">
        <p className="label">Target ENS name</p>
        <p className="font-mono text-sm text-white">{ensName || "—"}</p>
        <p className="text-xs text-gray-500">
          Key: <code className="text-brand-300">allowance.policy.v1</code>
        </p>
      </div>

      {/* Step 1 — copy JSON */}
      <div className="space-y-2">
        <p className="label">Step 1 — Copy the policy JSON</p>
        <div className="relative">
          <pre className={`text-[10px] font-mono leading-relaxed p-3 rounded-xl bg-surface-200/60 border border-surface-300/50 overflow-auto max-h-40 text-gray-300 ${!canAct ? "opacity-40" : ""}`}>
            {policyJson ?? "Author a policy first"}
          </pre>
          {canAct && (
            <button
              onClick={copyJson}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-300/60 hover:bg-surface-400/60 transition-colors"
              title="Copy JSON"
            >
              {copied
                ? <Check className="w-3.5 h-3.5 text-success" />
                : <Copy className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          )}
        </div>
        {policyHash && (
          <p className="text-[10px] font-mono text-gray-600 truncate" title={policyHash}>
            keccak256: {policyHash}
          </p>
        )}
      </div>

      {/* Step 2 — set on ENS explorer */}
      <div className="space-y-2">
        <p className="label">Step 2 — Set it on ENS explorer</p>
        <a
          href={ensExplorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
            canAct
              ? "bg-brand-600/10 border-brand-500/30 text-brand-300 hover:bg-brand-600/20 hover:border-brand-500/50"
              : "bg-surface-200/40 border-surface-300/30 text-gray-600 pointer-events-none"
          }`}
        >
          <span className="text-sm font-medium">
            {ensName ? `Open ${ensName} on explorer.ens.dev` : "Open ENS Explorer"}
          </span>
          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
        </a>
        <p className="text-xs text-gray-600">
          Go to Records → Add record → key <code className="text-brand-300">allowance.policy.v1</code> → paste the JSON above → Save.
        </p>
      </div>

      {/* Step 3 — verify */}
      <div className="space-y-2">
        <p className="label">Step 3 — Verify it&apos;s live</p>
        <button
          className="btn-secondary w-full justify-center"
          disabled={!canAct || verifyState === "checking"}
          onClick={verify}
        >
          {verifyState === "checking" ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Checking…</>
          ) : (
            <><RefreshCw className="w-4 h-4" />Check ENS record</>
          )}
        </button>

        {verifyState === "found" && (
          <div className="space-y-2 p-3 rounded-xl bg-success/10 border border-success/20">
            <p className="text-sm font-semibold text-success flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Policy found on ENS
            </p>
            <pre className="text-[10px] font-mono text-gray-400 overflow-auto max-h-24 leading-relaxed">
              {livePolicy}
            </pre>
          </div>
        )}

        {verifyState === "not-found" && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20 text-sm text-warning">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>No record found yet. Set it on ENS explorer first, then check again.</p>
          </div>
        )}
      </div>
    </div>
  );
}

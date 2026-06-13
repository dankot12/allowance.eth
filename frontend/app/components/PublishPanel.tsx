"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2, AlertCircle, ExternalLink, Loader2,
  Copy, Check, RefreshCw, Send,
} from "lucide-react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { namehash, parseAbi, type Hash } from "viem";
import type { AllowancePolicy } from "@/lib/policySchema";
import {
  computePolicyHash,
  fetchPolicyFromENS,
  POLICY_GUARD_ADDRESS,
  POLICY_GUARD_ABI,
  POLICY_ENS_KEY,
  ENS_PUBLIC_RESOLVER,
} from "@/lib/ensClient";

const RESOLVER_ABI = parseAbi([
  "function text(bytes32 node, string key) external view returns (string)",
  "function setText(bytes32 node, string key, string value) external",
]);

interface PublishPanelProps {
  policy: AllowancePolicy | null;
  ensName: string;
}

type PublishStep = "idle" | "approving" | "setting-ens" | "registering-guard" | "done" | "error";
type VerifyState = "idle" | "checking" | "found" | "not-found";

export default function PublishPanel({ policy, ensName }: PublishPanelProps) {
  const { primaryWallet } = useDynamicContext();

  const [copied, setCopied] = useState(false);
  const [publishStep, setPublishStep] = useState<PublishStep>("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [ensTxHash, setEnsTxHash] = useState<Hash | null>(null);
  const [guardTxHash, setGuardTxHash] = useState<Hash | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [livePolicy, setLivePolicy] = useState<string | null>(null);

  const policyJson = policy ? JSON.stringify(policy, null, 2) : null;
  const policyJsonMinified = policy ? JSON.stringify(policy) : null;
  const policyHash = policyJsonMinified ? computePolicyHash(policyJsonMinified) : null;

  const canAct = !!policy && !!ensName.trim() && !!primaryWallet;

  // Reset on name/policy change
  useEffect(() => {
    setPublishStep("idle");
    setPublishError(null);
    setEnsTxHash(null);
    setGuardTxHash(null);
    setVerifyState("idle");
    setLivePolicy(null);
  }, [policy, ensName]);

  const copyJson = () => {
    if (!policyJsonMinified) return;
    navigator.clipboard.writeText(policyJsonMinified).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const publish = async () => {
    if (!policy || !ensName.trim() || !primaryWallet) return;
    if (!isEthereumWallet(primaryWallet)) {
      setPublishError("Connect an Ethereum wallet to publish.");
      return;
    }

    setPublishStep("approving");
    setPublishError(null);
    setEnsTxHash(null);
    setGuardTxHash(null);

    try {
      const walletClient = await primaryWallet.getWalletClient();
      const account = walletClient.account;
      if (!account) throw new Error("No account on wallet client");

      const node = namehash(ensName);
      const policyStr = JSON.stringify(policy);
      const hash = computePolicyHash(policyStr);

      // Step 1 — setText on ENS resolver
      setPublishStep("setting-ens");
      const ensTx = await walletClient.writeContract({
        address: ENS_PUBLIC_RESOLVER,
        abi: RESOLVER_ABI,
        functionName: "setText",
        args: [node, POLICY_ENS_KEY, policyStr],
        account,
      });
      setEnsTxHash(ensTx);

      // Step 2 — register hash on PolicyGuard
      if (POLICY_GUARD_ADDRESS !== "0x0000000000000000000000000000000000000000") {
        setPublishStep("registering-guard");
        const guardTx = await walletClient.writeContract({
          address: POLICY_GUARD_ADDRESS,
          abi: POLICY_GUARD_ABI,
          functionName: "updatePolicy",
          args: [node, hash],
          account,
        });
        setGuardTxHash(guardTx);
      }

      setPublishStep("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // CCIP-Write revert: 0x4b27a133 StorageHandledByOffChainDatabase
      if (msg.includes("0x4b27a133") || msg.toLowerCase().includes("offchaindatabase")) {
        setPublishError(
          "This ENS name uses an off-chain (CCIP) resolver — setText must be done via ENS Explorer manually."
        );
      } else {
        setPublishError(msg);
      }
      setPublishStep("error");
    }
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

  const ensExplorerUrl = `https://explorer.ens.dev/${ensName || ""}`;

  const isPublishing =
    publishStep === "approving" ||
    publishStep === "setting-ens" ||
    publishStep === "registering-guard";

  const publishLabel = {
    idle: "Publish to ENS",
    approving: "Waiting for approval…",
    "setting-ens": "Setting ENS record…",
    "registering-guard": "Registering hash on PolicyGuard…",
    done: "Published",
    error: "Retry publish",
  }[publishStep];

  return (
    <div className="card p-5 space-y-4">
      <h3 className="font-semibold text-white">Publish to ENS</h3>

      {/* Target */}
      <div className="p-3 rounded-xl bg-surface-200/50 border border-surface-300/50 space-y-1">
        <p className="label">Target ENS name</p>
        <p className="font-mono text-sm text-white">{ensName || "—"}</p>
        <p className="text-xs text-gray-500">
          Key: <code className="text-brand-300">{POLICY_ENS_KEY}</code>
        </p>
        <p className="text-[10px] font-mono text-gray-600 truncate" title={ENS_PUBLIC_RESOLVER}>
          Resolver: {ENS_PUBLIC_RESOLVER}
        </p>
      </div>

      {/* Policy JSON */}
      <div className="space-y-1.5">
        <p className="label">Policy JSON</p>
        <div className="relative">
          <pre
            className={`text-[10px] font-mono leading-relaxed p-3 rounded-xl bg-surface-200/60 border border-surface-300/50 overflow-auto max-h-40 text-gray-300 ${
              !policy ? "opacity-40" : ""
            }`}
          >
            {policyJson ?? "Author a policy first"}
          </pre>
          {policy && (
            <button
              onClick={copyJson}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-300/60 hover:bg-surface-400/60 transition-colors"
              title="Copy JSON"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-success" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>
          )}
        </div>
        {policyHash && (
          <p className="text-[10px] font-mono text-gray-600 truncate" title={policyHash}>
            keccak256: {policyHash}
          </p>
        )}
      </div>

      {/* Publish button */}
      <button
        className={`btn-primary w-full justify-center ${publishStep === "done" ? "opacity-70" : ""}`}
        disabled={!canAct || isPublishing || publishStep === "done"}
        onClick={publish}
      >
        {isPublishing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {publishLabel}
      </button>

      {/* Tx receipts */}
      {(ensTxHash || guardTxHash) && (
        <div className="space-y-1.5">
          {ensTxHash && (
            <TxLink label="ENS setText" hash={ensTxHash} />
          )}
          {guardTxHash && (
            <TxLink label="PolicyGuard.updatePolicy" hash={guardTxHash} />
          )}
        </div>
      )}

      {/* Error */}
      {publishStep === "error" && publishError && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs">{publishError}</p>
          </div>
          {publishError.includes("off-chain") && (
            <a
              href={ensExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-xl border bg-brand-600/10 border-brand-500/30 text-brand-300 hover:bg-brand-600/20 transition-colors"
            >
              <span className="text-sm">Open {ensName} on ENS Explorer</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Success */}
      {publishStep === "done" && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/20 text-sm text-success">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Policy published. Verify below to confirm it&apos;s live.
        </div>
      )}

      {/* Verify */}
      <div className="space-y-2 pt-1 border-t border-surface-300/30">
        <p className="label">Verify on-chain</p>
        <button
          className="btn-secondary w-full justify-center"
          disabled={!canAct || verifyState === "checking"}
          onClick={verify}
        >
          {verifyState === "checking" ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Checking…</>
          ) : (
            <><RefreshCw className="w-4 h-4" />Read ENS record</>
          )}
        </button>

        {verifyState === "found" && (
          <div className="space-y-2 p-3 rounded-xl bg-success/10 border border-success/20">
            <p className="text-sm font-semibold text-success flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Record found
            </p>
            <pre className="text-[10px] font-mono text-gray-400 overflow-auto max-h-24 leading-relaxed">
              {livePolicy}
            </pre>
          </div>
        )}

        {verifyState === "not-found" && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20 text-sm text-warning">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>No record found yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TxLink({ label, hash }: { label: string; hash: Hash }) {
  return (
    <a
      href={`https://sepolia.etherscan.io/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-2 rounded-lg bg-surface-200/60 border border-surface-300/50 hover:border-brand-500/30 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500">{label}</p>
        <p className="text-xs font-mono text-brand-300 truncate">{hash}</p>
      </div>
      <ExternalLink className="w-3 h-3 text-gray-500 flex-shrink-0 ml-2" />
    </a>
  );
}

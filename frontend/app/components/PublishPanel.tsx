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
  publicClient,
} from "@/lib/ensClient";

const RESOLVER_ABI = parseAbi([
  "function text(bytes32 node, string key) external view returns (string)",
  "function setText(bytes32 node, string key, string value) external",
]);

interface PublishPanelProps {
  policy: AllowancePolicy | null;
  ensName: string;
  onPublished?: (ensName: string) => void;
}

type PublishStep = "idle" | "setting-ens" | "registering-guard" | "done" | "error";
type VerifyState = "idle" | "checking" | "found" | "not-found";

export default function PublishPanel({ policy, ensName, onPublished }: PublishPanelProps) {
  const { primaryWallet } = useDynamicContext();

  const [copied, setCopied] = useState(false);
  const [publishStep, setPublishStep] = useState<PublishStep>("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [ensWarning, setEnsWarning] = useState<string | null>(null);
  const [ensTxHash, setEnsTxHash] = useState<Hash | null>(null);
  const [guardTxHash, setGuardTxHash] = useState<Hash | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [livePolicy, setLivePolicy] = useState<string | null>(null);

  const policyJsonMinified = policy ? JSON.stringify(policy) : null;
  const policyHash = policyJsonMinified ? computePolicyHash(policyJsonMinified) : null;

  const canAct = !!policy && !!ensName.trim() && !!primaryWallet;
  const guardDeployed = POLICY_GUARD_ADDRESS !== "0x0000000000000000000000000000000000000000";

  useEffect(() => {
    setPublishStep("idle");
    setPublishError(null);
    setEnsWarning(null);
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

    setPublishStep("setting-ens");
    setPublishError(null);
    setEnsWarning(null);
    setEnsTxHash(null);
    setGuardTxHash(null);

    try {
      const walletClient = await primaryWallet.getWalletClient();
      const account = walletClient.account;
      if (!account) throw new Error("No account on wallet client");

      const node = namehash(ensName);
      const policyStr = JSON.stringify(policy);
      const hash = computePolicyHash(policyStr);

      // Step 1 — setText on the ENS name's actual resolver (looked up dynamically)
      try {
        const resolverAddress = await publicClient.getEnsResolver({ name: ensName });
        if (!resolverAddress || resolverAddress === "0x0000000000000000000000000000000000000000") {
          throw new Error("No resolver found for this ENS name on Sepolia");
        }
        // Pre-simulate to avoid MetaMask popup when resolver will reject (e.g. CCIP-Write, unauthorized)
        await publicClient.simulateContract({
          address: resolverAddress,
          abi: RESOLVER_ABI,
          functionName: "setText",
          args: [node, POLICY_ENS_KEY, policyStr],
          account,
        });
        const ensTx = await walletClient.writeContract({
          address: resolverAddress,
          abi: RESOLVER_ABI,
          functionName: "setText",
          args: [node, POLICY_ENS_KEY, policyStr],
          account,
        });
        setEnsTxHash(ensTx);
      } catch (ensErr: unknown) {
        const msg = ensErr instanceof Error ? ensErr.message : String(ensErr);
        if (msg.includes("0x4b27a133") || msg.toLowerCase().includes("offchaindatabase")) {
          setEnsWarning(
            "ENS text record requires ENS Explorer (off-chain resolver). Copy the JSON and set it manually. PolicyGuard hash will still be registered below."
          );
        } else if (msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("not owner")) {
          setEnsWarning(`ENS setText rejected — wallet may not control ${ensName} on Sepolia. Set the text record manually via ENS Explorer. Registering PolicyGuard hash below.`);
        } else {
          setEnsWarning(`ENS setText skipped (${msg.slice(0, 80)}). Registering PolicyGuard hash only.`);
        }
      }

      // Step 2 — register hash on PolicyGuard (always proceed, even if ENS setText failed)
      if (guardDeployed) {
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
      onPublished?.(ensName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPublishError(msg.slice(0, 200));
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

  const ensExplorerUrl = `https://explorer.ens.dev/${ensName}`;
  const isPublishing = publishStep === "setting-ens" || publishStep === "registering-guard";

  const publishLabel = {
    idle: "Publish to ENS + PolicyGuard",
    "setting-ens": "Setting ENS record…",
    "registering-guard": "Registering hash on-chain…",
    done: "Published",
    error: "Retry publish",
  }[publishStep];

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Publish Policy</h3>
        {policyHash && (
          <div className="flex items-center gap-1">
            <button onClick={copyJson} className="p-1.5 rounded-lg bg-surface-300/60 hover:bg-surface-400/60 transition-colors" title="Copy JSON">
              {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3 text-gray-400" />}
            </button>
          </div>
        )}
      </div>

      <div className="p-3 rounded-xl bg-surface-200/50 border border-surface-300/50 space-y-1">
        <div className="flex items-center justify-between">
          <p className="font-mono text-sm text-white">{ensName || "—"}</p>
          <span className="badge badge-muted text-[10px]">{POLICY_ENS_KEY}</span>
        </div>
        {policyHash && (
          <p className="text-[10px] font-mono text-gray-600 truncate" title={policyHash}>
            hash: {policyHash.slice(0, 18)}…
          </p>
        )}
      </div>

      <button
        className={`btn-primary w-full justify-center ${publishStep === "done" ? "opacity-70" : ""}`}
        disabled={!canAct || isPublishing || publishStep === "done"}
        onClick={publish}
      >
        {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {publishLabel}
      </button>

      {/* ENS warning (non-fatal) */}
      {ensWarning && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <p>{ensWarning}</p>
          </div>
          <a
            href={ensExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-2.5 rounded-xl border bg-brand-600/10 border-brand-500/30 text-brand-300 hover:bg-brand-600/20 transition-colors text-xs"
          >
            <span>Open {ensName} on ENS App → Records</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Error */}
      {publishStep === "error" && publishError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-xs text-danger">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <p>{publishError}</p>
        </div>
      )}

      {/* Tx receipts */}
      {(ensTxHash || guardTxHash) && (
        <div className="space-y-1.5">
          {ensTxHash && <TxLink label="ENS setText" hash={ensTxHash} />}
          {guardTxHash && <TxLink label="PolicyGuard.updatePolicy" hash={guardTxHash} />}
        </div>
      )}

      {/* Success */}
      {publishStep === "done" && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/20 text-sm text-success">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {guardTxHash && !ensTxHash
            ? "PolicyGuard hash registered. Set ENS text record via ENS App."
            : "Policy published and hash registered on-chain."}
        </div>
      )}

      {/* Verify */}
      <div className="space-y-2 pt-1 border-t border-surface-300/30">
        <button
          className="btn-secondary w-full justify-center text-xs"
          disabled={!ensName.trim() || verifyState === "checking"}
          onClick={verify}
        >
          {verifyState === "checking"
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking…</>
            : <><RefreshCw className="w-3.5 h-3.5" />Verify ENS record</>}
        </button>

        {verifyState === "found" && (
          <div className="space-y-1.5 p-3 rounded-xl bg-success/10 border border-success/20">
            <p className="text-xs font-semibold text-success flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Record found in ENS
            </p>
            <pre className="text-[10px] font-mono text-gray-400 overflow-auto max-h-20 leading-relaxed">
              {livePolicy}
            </pre>
          </div>
        )}

        {verifyState === "not-found" && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            No record found yet — it may take a moment to propagate.
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

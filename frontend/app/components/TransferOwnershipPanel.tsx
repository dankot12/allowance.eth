"use client";

import { useState, useEffect, useCallback } from "react";
import { namehash, isAddress, type Address } from "viem";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Repeat2, CheckCircle2, XCircle, Loader2, ExternalLink, AlertTriangle, Cpu } from "lucide-react";
import {
  publicClient,
  POLICY_GUARD_ADDRESS,
  POLICY_GUARD_ABI,
} from "@/lib/ensClient";

const ZERO = "0x0000000000000000000000000000000000000000";

type StepStatus = "pending" | "running" | "done" | "failed";
type Route = "metamask" | "relayer" | "none";

interface Props {
  ensName: string;
}

export default function TransferOwnershipPanel({ ensName }: Props) {
  const { primaryWallet } = useDynamicContext();
  const [newOwner, setNewOwner] = useState("");

  const [currentOwner, setCurrentOwner] = useState<string | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(false);

  const [status, setStatus] = useState<StepStatus>("pending");
  const [tx, setTx] = useState<string | null>(null);
  const [verifiedOwner, setVerifiedOwner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [routeUsed, setRouteUsed] = useState<Route | null>(null);

  const addressValid = isAddress(newOwner);
  const walletAddr = primaryWallet?.address?.toLowerCase();
  const connectedIsOwner = currentOwner && walletAddr ? currentOwner.toLowerCase() === walletAddr : false;

  const loadOwner = useCallback(async () => {
    if (!ensName.includes(".")) { setCurrentOwner(null); return; }
    setOwnerLoading(true);
    try {
      const owner = await publicClient.readContract({
        address: POLICY_GUARD_ADDRESS,
        abi: POLICY_GUARD_ABI,
        functionName: "policyOwners",
        args: [namehash(ensName)],
      }) as string;
      setCurrentOwner(owner === ZERO ? null : owner);
    } catch {
      setCurrentOwner(null);
    } finally {
      setOwnerLoading(false);
    }
  }, [ensName]);

  useEffect(() => {
    setStatus("pending");
    setTx(null);
    setVerifiedOwner(null);
    setError(null);
    setRouteUsed(null);
    loadOwner();
  }, [ensName, loadOwner]);

  // Decide how the transfer will be executed
  const route: Route = !currentOwner
    ? "none"
    : connectedIsOwner
    ? "metamask"   // you own it → sign with your wallet
    : "relayer";   // someone else (likely the deployer/relayer) owns it → try backend

  const canTransfer =
    ensName.includes(".") && addressValid && !!currentOwner && status !== "running";

  async function transfer() {
    if (!currentOwner || !addressValid) return;
    setStatus("running");
    setTx(null);
    setVerifiedOwner(null);
    setError(null);
    setRouteUsed(route);

    try {
      if (route === "metamask") {
        // Connected wallet is the owner — sign directly
        if (!primaryWallet || !isEthereumWallet(primaryWallet)) throw new Error("Connect an Ethereum wallet.");
        const walletClient = await primaryWallet.getWalletClient();
        const txHash = await walletClient.writeContract({
          address: POLICY_GUARD_ADDRESS,
          abi: POLICY_GUARD_ABI,
          functionName: "transferPolicyOwnership",
          args: [namehash(ensName), newOwner as Address],
          account: walletClient.account!,
        });
        setTx(txHash);
        await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      } else {
        // Owner is the relayer (deployer) — execute server-side, no popup
        const res = await fetch("/api/transfer-ownership", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ensName, newOwner }),
        });
        const data = await res.json() as { txHash?: string; error?: string };
        if (!res.ok || !data.txHash) throw new Error(data.error ?? "Transfer failed");
        setTx(data.txHash);
      }

      // Verify on-chain
      const owner = await publicClient.readContract({
        address: POLICY_GUARD_ADDRESS,
        abi: POLICY_GUARD_ABI,
        functionName: "policyOwners",
        args: [namehash(ensName)],
      }) as string;
      setVerifiedOwner(owner);
      setCurrentOwner(owner === ZERO ? null : owner);
      setStatus("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message.slice(0, 220) : String(e));
      setStatus("failed");
    }
  }

  return (
    <div className="card p-5 space-y-4 border-amber-800/30">
      <div className="flex items-center gap-2">
        <Repeat2 className="w-4 h-4 text-amber-400" />
        <h2 className="font-semibold text-white">Transfer Agent Identity</h2>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Ownership of <span className="font-mono text-gray-300">{ensName || "your agent"}</span> is
        anchored in PolicyGuard — that&apos;s what gates who can edit the policy, set approvers, and
        publish updates. Transfer it and the spending policy travels with the name. Nothing resets.
      </p>

      {/* Current owner */}
      {ensName.includes(".") && (
        <div className="rounded-lg bg-surface-200/40 border border-surface-300/40 px-3 py-2.5 space-y-1.5">
          {ownerLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Reading on-chain owner…
            </div>
          ) : currentOwner ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">Current policy owner</span>
                <span className={`text-xs font-mono ${connectedIsOwner ? "text-emerald-400" : "text-gray-300"}`}>
                  {currentOwner.slice(0, 8)}…{currentOwner.slice(-6)}
                  {connectedIsOwner && <span className="ml-1 font-sans text-emerald-500">(you)</span>}
                </span>
              </div>
              {/* Routing hint */}
              {route === "metamask" ? (
                <p className="text-xs text-gray-600">
                  You hold this identity — the transfer will be signed by your wallet.
                </p>
              ) : (
                <div className="flex items-start gap-1.5">
                  <Cpu className="w-3 h-3 text-brand-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-brand-400">
                    Held by the deployer/relayer. The transfer runs server-side with the owner key —
                    no wallet popup needed.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-400">
                No policy registered for this name on PolicyGuard yet — publish one before transferring.
              </p>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="label mb-1.5 block">New owner address</label>
        <input
          className={`input-field font-mono text-sm ${newOwner && !addressValid ? "border-danger/50" : ""}`}
          placeholder="0x…"
          value={newOwner}
          onChange={(e) => { setNewOwner(e.target.value); setError(null); }}
          disabled={status === "running"}
        />
        {newOwner && !addressValid && (
          <p className="text-xs text-danger mt-1">Not a valid address</p>
        )}
      </div>

      <button
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-900/20 border border-amber-700/30 text-amber-300 text-sm font-medium hover:bg-amber-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!canTransfer}
        onClick={transfer}
      >
        {status === "running"
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Transferring…</>
          : route === "relayer"
          ? <><Cpu className="w-4 h-4" /> Transfer (server-side)</>
          : <><Repeat2 className="w-4 h-4" /> Transfer ownership</>}
      </button>

      {/* Result */}
      {status === "done" && verifiedOwner && (
        <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-700/20 space-y-2">
          <p className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Transfer verified on-chain {routeUsed === "relayer" && "(via relayer)"}
          </p>
          <p className="text-xs text-gray-500">
            New policy owner:{" "}
            <span className="font-mono text-gray-300">
              {verifiedOwner.slice(0, 10)}…{verifiedOwner.slice(-8)}
            </span>
          </p>
          <p className="text-xs text-gray-600">
            Daily cap, approval threshold, allowlist, and human approver are unchanged. The policy
            traveled with the name.
          </p>
          {tx && (
            <a
              href={`https://sepolia.etherscan.io/tx/${tx}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-brand-400 hover:underline font-mono"
            >
              {tx.slice(0, 20)}…
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      )}

      {status === "failed" && error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-xs text-danger">
          <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <p className="leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  );
}

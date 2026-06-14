"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { ShieldCheck, CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";

interface Props {
  ensName: string;
}

type StepStatus = "pending" | "running" | "done" | "failed";

export default function GrantResolverRolePanel({ ensName }: Props) {
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState<StepStatus>("pending");
  const [tx, setTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addressValid = isAddress(account);
  const canGrant = ensName.includes(".") && addressValid && status !== "running";

  async function grantRole() {
    if (!canGrant) return;
    setStatus("running");
    setTx(null);
    setError(null);

    try {
      const res = await fetch("/api/grant-resolver-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ensName, account }),
      });
      const data = await res.json() as { txHash?: string; error?: string };
      if (!res.ok || !data.txHash) throw new Error(data.error ?? "Grant failed");
      setTx(data.txHash);
      setStatus("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message.slice(0, 280) : String(e));
      setStatus("failed");
    }
  }

  return (
    <div className="card p-5 space-y-4 border-brand-600/30">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-brand-400" />
        <h2 className="font-semibold text-white">Grant ENS Resolver Access</h2>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Give a wallet address full manager rights on{" "}
        <span className="font-mono text-gray-300">{ensName || "the agent"}</span> — it can update
        the ETH address record, text records, content hash, and all other resolver fields on the
        ENS v2 resolver. Runs server-side via the owner key, no wallet popup.
      </p>

      <div>
        <label className="label mb-1.5 block">Wallet address to grant access</label>
        <input
          className={`input-field font-mono text-sm ${account && !addressValid ? "border-danger/50" : ""}`}
          placeholder="0x…"
          value={account}
          onChange={(e) => { setAccount(e.target.value); setError(null); }}
          disabled={status === "running"}
        />
        {account && !addressValid && (
          <p className="text-xs text-danger mt-1">Not a valid address</p>
        )}
      </div>

      <button
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-brand-600/15 border border-brand-500/30 text-brand-300 text-sm font-medium hover:bg-brand-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!canGrant}
        onClick={grantRole}
      >
        {status === "running"
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Granting roles…</>
          : <><ShieldCheck className="w-4 h-4" /> Grant manager roles (server-side)</>}
      </button>

      {status === "done" && tx && (
        <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-700/20 space-y-2">
          <p className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Manager roles granted on ENS v2 resolver
          </p>
          <p className="text-xs text-gray-500">
            <span className="font-mono text-gray-300">{account.slice(0, 10)}…{account.slice(-8)}</span>{" "}
            can now update addr, text records, and content hash for{" "}
            <span className="font-mono text-gray-300">{ensName}</span>.
          </p>
          <a
            href={`https://sepolia.etherscan.io/tx/${tx}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-brand-400 hover:underline font-mono"
          >
            {tx.slice(0, 20)}…
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
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

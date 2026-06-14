"use client";

import { useState, useEffect, useCallback } from "react";
import { namehash, isAddress, type Address } from "viem";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import {
  Repeat2, CheckCircle2, XCircle, Loader2, ExternalLink, AlertTriangle, ShieldCheck, MapPin,
} from "lucide-react";
import {
  publicClient,
  POLICY_GUARD_ADDRESS,
  POLICY_GUARD_ABI,
  ENS_PUBLIC_RESOLVER,
  RESOLVER_ABI,
} from "@/lib/ensClient";
import { sepolia } from "viem/chains";

const ZERO = "0x0000000000000000000000000000000000000000";

const ENS_V2_RESOLVER = "0xdc58Fa0E2915579b0679ee9c6dDd328b47e90c99" as Address;

// All leaf write roles from PermissionedResolverLib ORed together
const USER_ROLE_BITMAP = BigInt("73032339729");

const AUTHORIZE_NAME_ROLES_ABI = [{
  name: "authorizeNameRoles", type: "function" as const, stateMutability: "nonpayable" as const,
  inputs: [
    { name: "toName",     type: "bytes" as const    },
    { name: "roleBitmap", type: "uint256" as const  },
    { name: "account",    type: "address" as const  },
    { name: "grant",      type: "bool" as const     },
  ],
  outputs: [{ name: "", type: "bool" as const }],
}] as const;

function dnsEncode(name: string): `0x${string}` {
  const enc = new TextEncoder();
  const parts: number[] = [];
  for (const label of name.toLowerCase().split(".")) {
    const bytes = Array.from(enc.encode(label));
    parts.push(bytes.length, ...bytes);
  }
  parts.push(0);
  return `0x${parts.map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

type StepStatus = "idle" | "running" | "done" | "failed";
interface StepState { status: StepStatus; tx: string | null; error: string | null; }
const fresh = (): StepState => ({ status: "idle", tx: null, error: null });

interface Props { ensName: string; }

export default function TransferIdentityPanel({ ensName }: Props) {
  const { primaryWallet } = useDynamicContext();
  const [newOwner, setNewOwner] = useState("");
  const [currentOwner, setCurrentOwner] = useState<string | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(false);

  // ENS group
  const [resolverStep, setResolverStep] = useState<StepState>(fresh());
  const [addrStep, setAddrStep]         = useState<StepState>(fresh());
  const [ensRunning, setEnsRunning]     = useState(false);

  // PolicyGuard group
  const [ownershipStep, setOwnershipStep] = useState<StepState>(fresh());
  const [pgRunning, setPgRunning]         = useState(false);

  const addressValid = isAddress(newOwner);
  const walletAddr = primaryWallet?.address?.toLowerCase();
  const connectedIsOwner = currentOwner && walletAddr
    ? currentOwner.toLowerCase() === walletAddr
    : false;

  const anyRunning = ensRunning || pgRunning;
  const canAct = ensName.includes(".") && addressValid && !!primaryWallet && !anyRunning;
  const canPg  = canAct && !!currentOwner;

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
    } catch { setCurrentOwner(null); }
    finally { setOwnerLoading(false); }
  }, [ensName]);

  useEffect(() => {
    setResolverStep(fresh());
    setAddrStep(fresh());
    setOwnershipStep(fresh());
    setEnsRunning(false);
    setPgRunning(false);
    loadOwner();
  }, [ensName, loadOwner]);

  // ── ENS group: grant resolver roles + set addr ──────────────────
  async function runEnsSteps() {
    if (!canAct || !primaryWallet || !isEthereumWallet(primaryWallet)) return;
    const walletClient = await primaryWallet.getWalletClient();
    const account = walletClient.account!;

    setEnsRunning(true);
    setResolverStep(fresh());
    setAddrStep(fresh());

    // Step A: grant resolver roles → MetaMask (caller must have ADMIN/ROOT on the resolver)
    setResolverStep((s) => ({ ...s, status: "running" }));
    try {
      const toName = dnsEncode(ensName);
      await publicClient.simulateContract({
        address: ENS_V2_RESOLVER, abi: AUTHORIZE_NAME_ROLES_ABI,
        functionName: "authorizeNameRoles",
        args: [toName, USER_ROLE_BITMAP, newOwner as Address, true],
        account: account.address,
      });
      const txHash = await walletClient.writeContract({
        address: ENS_V2_RESOLVER, abi: AUTHORIZE_NAME_ROLES_ABI,
        functionName: "authorizeNameRoles",
        args: [toName, USER_ROLE_BITMAP, newOwner as Address, true],
        account, chain: sepolia,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      setResolverStep({ status: "done", tx: txHash, error: null });
    } catch (e: unknown) {
      setResolverStep({ status: "failed", tx: null, error: errMsg(e) });
      setEnsRunning(false);
      return;
    }

    // Step B: setAddr via MetaMask (permissionless resolver)
    setAddrStep((s) => ({ ...s, status: "running" }));
    try {
      const node = namehash(ensName);
      await publicClient.simulateContract({
        address: ENS_PUBLIC_RESOLVER, abi: RESOLVER_ABI,
        functionName: "setAddr", args: [node, newOwner as Address],
        account: account.address,
      });
      const txHash = await walletClient.writeContract({
        address: ENS_PUBLIC_RESOLVER, abi: RESOLVER_ABI,
        functionName: "setAddr", args: [node, newOwner as Address],
        account, chain: sepolia,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      setAddrStep({ status: "done", tx: txHash, error: null });
    } catch (e: unknown) {
      setAddrStep({ status: "failed", tx: null, error: errMsg(e) });
    } finally {
      setEnsRunning(false);
    }
  }

  // ── PolicyGuard group: transfer ownership ───────────────────────
  async function runOwnershipStep() {
    if (!canPg || !primaryWallet || !isEthereumWallet(primaryWallet)) return;
    const walletClient = await primaryWallet.getWalletClient();
    const account = walletClient.account!;

    setPgRunning(true);
    setOwnershipStep(fresh());

    try {
      if (connectedIsOwner) {
        await publicClient.simulateContract({
          address: POLICY_GUARD_ADDRESS, abi: POLICY_GUARD_ABI,
          functionName: "transferPolicyOwnership",
          args: [namehash(ensName), newOwner as Address],
          account: account.address,
        });
        const txHash = await walletClient.writeContract({
          address: POLICY_GUARD_ADDRESS, abi: POLICY_GUARD_ABI,
          functionName: "transferPolicyOwnership",
          args: [namehash(ensName), newOwner as Address],
          account, chain: sepolia,
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        setOwnershipStep({ status: "done", tx: txHash, error: null });
      } else {
        const res = await fetch("/api/transfer-ownership", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ensName, newOwner }),
        });
        const data = await res.json() as { txHash?: string; error?: string };
        if (!res.ok || !data.txHash) throw new Error(data.error ?? "Transfer failed");
        setOwnershipStep({ status: "done", tx: data.txHash, error: null });
      }
      await loadOwner();
    } catch (e: unknown) {
      setOwnershipStep({ status: "failed", tx: null, error: errMsg(e) });
    } finally {
      setPgRunning(false);
    }
  }

  return (
    <div className="card p-5 space-y-5 border-amber-800/30">
      <div className="flex items-center gap-2">
        <Repeat2 className="w-4 h-4 text-amber-400" />
        <h2 className="font-semibold text-white">Transfer Agent Identity</h2>
      </div>

      {/* Shared address input */}
      <div>
        <label className="label mb-1.5 block">New owner address</label>
        <input
          className={`input-field font-mono text-sm ${newOwner && !addressValid ? "border-danger/50" : ""}`}
          placeholder="0x…"
          value={newOwner}
          onChange={(e) => setNewOwner(e.target.value)}
          disabled={anyRunning}
        />
        {newOwner && !addressValid && (
          <p className="text-xs text-danger mt-1">Not a valid address</p>
        )}
      </div>

      {/* ── ENS block ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-surface-300/40 bg-surface-200/20 p-4 space-y-3">
        <p className="text-xs font-medium text-gray-300">ENS Identity</p>
        <div className="space-y-2">
          <StepRow icon={<ShieldCheck className="w-3.5 h-3.5" />}
            label="Grant ENS resolver manager roles → MetaMask"
            step={resolverStep} />
          <StepRow icon={<MapPin className="w-3.5 h-3.5" />}
            label="Update ENS addr record → MetaMask"
            step={addrStep} />
        </div>
        <button
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-brand-600/15 border border-brand-500/30 text-brand-300 text-sm font-medium hover:bg-brand-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canAct}
          onClick={runEnsSteps}
        >
          {ensRunning
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating ENS…</>
            : <><ShieldCheck className="w-4 h-4" /> Update ENS Identity</>}
        </button>
      </div>

      {/* ── PolicyGuard block ──────────────────────────────────── */}
      <div className="rounded-xl border border-amber-800/30 bg-amber-950/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-300">PolicyGuard Ownership</p>
          {ensName.includes(".") && (
            ownerLoading
              ? <Loader2 className="w-3 h-3 animate-spin text-gray-600" />
              : currentOwner
              ? <span className={`text-xs font-mono ${connectedIsOwner ? "text-emerald-400" : "text-gray-500"}`}>
                  {currentOwner.slice(0, 6)}…{currentOwner.slice(-4)}
                  {connectedIsOwner && <span className="ml-1 font-sans">(you)</span>}
                </span>
              : <div className="flex items-center gap-1 text-amber-400 text-xs">
                  <AlertTriangle className="w-3 h-3" /> no policy
                </div>
          )}
        </div>
        <StepRow icon={<Repeat2 className="w-3.5 h-3.5" />}
          label={`Transfer ownership${connectedIsOwner ? " → MetaMask" : " (server-side)"}`}
          step={ownershipStep} />
        <button
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-900/20 border border-amber-700/30 text-amber-300 text-sm font-medium hover:bg-amber-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canPg}
          onClick={runOwnershipStep}
        >
          {pgRunning
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Transferring…</>
            : connectedIsOwner
            ? <><Repeat2 className="w-4 h-4" /> Transfer Ownership → MetaMask</>
            : <><Repeat2 className="w-4 h-4" /> Transfer Ownership (server-side)</>}
        </button>
      </div>
    </div>
  );
}

function StepRow({ icon, label, step }: { icon: React.ReactNode; label: string; step: StepState }) {
  return (
    <div className="flex items-start gap-2.5 text-xs">
      <span className={`mt-0.5 flex-shrink-0 ${
        step.status === "done"    ? "text-emerald-400"
        : step.status === "failed"  ? "text-danger"
        : step.status === "running" ? "text-brand-400"
        : "text-gray-600"
      }`}>
        {step.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : step.status === "done"   ? <CheckCircle2 className="w-3.5 h-3.5" />
          : step.status === "failed" ? <XCircle className="w-3.5 h-3.5" />
          : icon}
      </span>
      <div className="flex-1 min-w-0">
        <span className={
          step.status === "done"    ? "text-emerald-300"
          : step.status === "failed"  ? "text-danger"
          : step.status === "running" ? "text-gray-200"
          : "text-gray-500"
        }>{label}</span>
        {step.error && <p className="text-danger mt-0.5 leading-relaxed break-words">{step.error}</p>}
        {step.tx && (
          <a href={`https://sepolia.etherscan.io/tx/${step.tx}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-brand-400 hover:underline font-mono mt-0.5">
            {step.tx.slice(0, 18)}… <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message.slice(0, 220) : String(e);
}

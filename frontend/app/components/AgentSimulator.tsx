"use client";

import { useState } from "react";
import { namehash, parseUnits, keccak256, toHex, type Address } from "viem";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Zap, Shield, CheckCircle2, XCircle, Loader2, AlertTriangle, Info } from "lucide-react";
import {
  publicClient,
  fetchPolicyFromENS,
  computePolicyHash,
  POLICY_GUARD_ADDRESS,
  POLICY_GUARD_ABI,
  POLICY_GUARD_FULL_ABI,
} from "@/lib/ensClient";
import type { AllowancePolicy } from "@/lib/policySchema";

// ─── helpers ─────────────────────────────────────────────────

type ParsedPolicy = {
  dailyCap:           { amount: bigint; enabled: boolean };
  approvalThreshold:  { amount: bigint; enabled: boolean };
  perCounterpartyCap: { amount: bigint; enabled: boolean };
  timeWindow:         { start: number;  end: number;    enabled: boolean };
  allowlist:          Address[];
  allowlistEnabled:   boolean;
};

function usdcToWei(amount: number): bigint {
  return parseUnits(amount.toString(), 18);
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 3600 + (m ?? 0) * 60;
}

function buildParsedPolicy(policy: AllowancePolicy): ParsedPolicy {
  return {
    dailyCap:           { amount: usdcToWei(policy.dailyCap?.amount ?? 0),          enabled: !!policy.dailyCap },
    approvalThreshold:  { amount: usdcToWei(policy.approvalThreshold?.amount ?? 0), enabled: !!policy.approvalThreshold },
    perCounterpartyCap: { amount: BigInt(0), enabled: false },
    timeWindow: {
      start:   policy.timeWindow ? parseTime(policy.timeWindow.start) : 0,
      end:     policy.timeWindow ? parseTime(policy.timeWindow.end)   : 86400,
      enabled: !!policy.timeWindow,
    },
    allowlist:        (policy.allowlist ?? []) as Address[],
    allowlistEnabled: (policy.allowlist?.length ?? 0) > 0,
  };
}

const KNOWN_TARGETS: { label: string; address: Address }[] = [
  { label: "Uniswap V3 Router",    address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" },
  { label: "Uniswap Universal",    address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD" },
  { label: "Random (not allowed)", address: "0x000000000000000000000000000000000000dEaD" },
];

// ─── types ───────────────────────────────────────────────────

type SimResult =
  | { status: "allowed" }
  | { status: "blocked"; reason: string }
  | { status: "needs_approval"; threshold: number }
  | { status: "policy_not_set" }
  | { status: "error"; message: string };

type ApprovalState = "idle" | "signing" | "submitting" | "approved" | "failed";

// ─── component ───────────────────────────────────────────────

interface Props {
  ensName: string;
  policy: AllowancePolicy | null;
}

export default function AgentSimulator({ ensName, policy }: Props) {
  const { primaryWallet } = useDynamicContext();

  const [target, setTarget] = useState<Address>(KNOWN_TARGETS[0].address);
  const [amountUsdc, setAmountUsdc] = useState(20);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [approvalState, setApprovalState] = useState<ApprovalState>("idle");
  const [approvalTx, setApprovalTx] = useState<string | null>(null);
  const [todaySpend, setTodaySpend] = useState<number | null>(null);

  const canSimulate = !!policy && ensName.includes(".");
  const guardDeployed = POLICY_GUARD_ADDRESS !== "0x0000000000000000000000000000000000000000";

  async function runSimulate() {
    if (!policy || !ensName.includes(".")) return;
    setSimLoading(true);
    setSimResult(null);
    setApprovalState("idle");
    setApprovalTx(null);

    try {
      const policyJson = await fetchPolicyFromENS(ensName);
      if (!policyJson) {
        setSimResult({ status: "error", message: "No policy found in ENS — publish one first." });
        return;
      }

      const parsedPolicy = buildParsedPolicy(JSON.parse(policyJson) as AllowancePolicy);
      const node = namehash(ensName);

      const [allowed, reason] = await publicClient.readContract({
        address: POLICY_GUARD_ADDRESS,
        abi: POLICY_GUARD_FULL_ABI,
        functionName: "simulate",
        args: [node, target, usdcToWei(amountUsdc), "0x", parsedPolicy, policyJson],
      }) as [boolean, string];

      // Also fetch today's spend for context
      const spend = await publicClient.readContract({
        address: POLICY_GUARD_ADDRESS,
        abi: POLICY_GUARD_FULL_ABI,
        functionName: "getTodaySpend",
        args: [node],
      }) as bigint;
      setTodaySpend(Number(spend) / 1e18);

      if (allowed) {
        setSimResult({ status: "allowed" });
      } else if (reason.includes("Approval")) {
        const threshold = policy.approvalThreshold?.amount ?? 0;
        setSimResult({ status: "needs_approval", threshold });
      } else if (reason === "PolicyNotSet") {
        setSimResult({ status: "policy_not_set" });
      } else {
        setSimResult({ status: "blocked", reason });
      }
    } catch (err: unknown) {
      setSimResult({ status: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSimLoading(false);
    }
  }

  async function registerPolicyHash() {
    if (!primaryWallet || !isEthereumWallet(primaryWallet) || !policy || !ensName.includes(".")) return;
    setSimLoading(true);
    try {
      const policyJson = await fetchPolicyFromENS(ensName);
      const policyStr = policyJson ?? JSON.stringify(policy);
      const hash = computePolicyHash(policyStr);
      const node = namehash(ensName);
      const walletClient = await primaryWallet.getWalletClient();
      await walletClient.writeContract({
        address: POLICY_GUARD_ADDRESS,
        abi: POLICY_GUARD_ABI,
        functionName: "updatePolicy",
        args: [node, hash],
        account: walletClient.account!,
      });
      // Re-simulate after registering
      await runSimulate();
    } catch (err: unknown) {
      setSimResult({ status: "error", message: err instanceof Error ? err.message.slice(0, 120) : String(err) });
      setSimLoading(false);
    }
  }

  async function runLedgerApproval() {
    if (!primaryWallet || !isEthereumWallet(primaryWallet) || !policy || !ensName.includes(".")) return;
    setApprovalState("signing");
    setApprovalTx(null);

    try {
      const policyJson = await fetchPolicyFromENS(ensName);
      if (!policyJson) throw new Error("Policy not found in ENS");

      const node = namehash(ensName);

      // Fetch the exact digest the contract will verify against
      const digest = await publicClient.readContract({
        address: POLICY_GUARD_ADDRESS,
        abi: POLICY_GUARD_FULL_ABI,
        functionName: "getApprovalDigest",
        args: [node, target, usdcToWei(amountUsdc), policyJson],
      }) as `0x${string}`;

      // signMessage adds \x19Ethereum Signed Message:\n32 prefix — Ledger shows this via ERC-7730
      const walletClient = await primaryWallet.getWalletClient();
      const humanSig = await walletClient.signMessage({ message: { raw: digest } });

      setApprovalState("submitting");
      const parsedPolicy = buildParsedPolicy(JSON.parse(policyJson) as AllowancePolicy);

      const txHash = await walletClient.writeContract({
        address: POLICY_GUARD_ADDRESS,
        abi: POLICY_GUARD_FULL_ABI,
        functionName: "checkWithHumanApproval",
        args: [node, target, usdcToWei(amountUsdc), "0x", parsedPolicy, policyJson, humanSig],
      });

      setApprovalTx(txHash);
      setApprovalState("approved");
    } catch (err: unknown) {
      console.error("Ledger approval failed:", err);
      setApprovalState("failed");
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-brand-400" />
          Agent Transaction Simulator
        </h2>
        {todaySpend !== null && (
          <span className="text-xs text-gray-500">
            Today: <span className="text-white font-mono">${todaySpend.toFixed(2)}</span>
            {policy?.dailyCap && <span className="text-gray-600"> / ${policy.dailyCap.amount}</span>}
          </span>
        )}
      </div>

      {!guardDeployed && (
        <div className="rounded-md bg-yellow-900/20 border border-yellow-700/30 px-3 py-2 text-xs text-yellow-400">
          PolicyGuard not configured. Set NEXT_PUBLIC_POLICY_GUARD_ADDRESS in .env.local.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label mb-1.5 block">Destination</label>
          <select
            className="input-field text-sm"
            value={target}
            onChange={(e) => { setTarget(e.target.value as Address); setSimResult(null); }}
          >
            {KNOWN_TARGETS.map(({ label, address }) => (
              <option key={address} value={address}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1.5 block">Amount (USDC)</label>
          <input
            type="number"
            min={1}
            max={1000}
            className="input-field text-sm font-mono"
            value={amountUsdc}
            onChange={(e) => { setAmountUsdc(Number(e.target.value)); setSimResult(null); }}
          />
        </div>
      </div>

      <button
        className="btn-primary w-full flex items-center justify-center gap-2"
        disabled={!canSimulate || !guardDeployed || simLoading}
        onClick={runSimulate}
      >
        {simLoading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Simulating…</>
          : <><Zap className="w-4 h-4" /> Simulate Agent Transaction</>}
      </button>

      {!canSimulate && (
        <p className="text-xs text-gray-600 text-center">
          {!ensName.includes(".") ? "Enter an ENS name above to simulate." : "Author a policy first."}
        </p>
      )}

      {/* Simulation result */}
      {simResult && (
        <div className={`rounded-lg border px-4 py-3 space-y-2 ${
          simResult.status === "allowed"
            ? "bg-emerald-950/30 border-emerald-700/40"
            : simResult.status === "needs_approval" || simResult.status === "policy_not_set"
            ? "bg-yellow-950/30 border-yellow-700/40"
            : "bg-red-950/20 border-red-800/30"
        }`}>
          {simResult.status === "allowed" && (
            <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Transaction allowed — agent can proceed autonomously.
            </div>
          )}

          {simResult.status === "policy_not_set" && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-yellow-400 text-sm">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium">Policy not registered on PolicyGuard</div>
                  <div className="text-xs text-yellow-500/80 mt-0.5">
                    The policy hash for <span className="font-mono">{ensName}</span> hasn&apos;t been registered on the new contract yet.
                  </div>
                </div>
              </div>
              <button
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-brand-600/20 border border-brand-500/30 text-brand-300 text-sm font-medium hover:bg-brand-600/30 transition-colors"
                disabled={!primaryWallet || simLoading}
                onClick={registerPolicyHash}
              >
                {simLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Register policy hash on-chain
              </button>
            </div>
          )}

          {simResult.status === "blocked" && (
            <div className="flex items-start gap-2 text-red-400 text-sm">
              <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Blocked on-chain</div>
                <div className="text-xs text-red-500/80 mt-0.5 font-mono">{simResult.reason}</div>
              </div>
            </div>
          )}

          {simResult.status === "error" && (
            <div className="flex items-start gap-2 text-red-400 text-sm">
              <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-xs">{simResult.message}</div>
            </div>
          )}

          {simResult.status === "needs_approval" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-yellow-400 font-medium text-sm">
                <AlertTriangle className="w-4 h-4" />
                Exceeds ${simResult.threshold} approval threshold — human sign-off required.
              </div>

              {/* Ledger approval flow */}
              {approvalState === "idle" && (
                <button
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-yellow-900/40 border border-yellow-700/50 text-yellow-300 text-sm font-medium hover:bg-yellow-900/60 transition-colors"
                  disabled={!primaryWallet}
                  onClick={runLedgerApproval}
                >
                  <Shield className="w-4 h-4" />
                  {primaryWallet ? "Approve on Ledger" : "Connect wallet to approve"}
                </button>
              )}

              {approvalState === "signing" && (
                <div className="flex items-center gap-2 text-yellow-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Waiting for Ledger signature… check your device.
                </div>
              )}

              {approvalState === "submitting" && (
                <div className="flex items-center gap-2 text-yellow-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting on-chain with human approval…
                </div>
              )}

              {approvalState === "approved" && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Human-approved — spend recorded on-chain.
                  </div>
                  {approvalTx && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${approvalTx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-400 hover:underline font-mono"
                    >
                      {approvalTx.slice(0, 18)}…
                    </a>
                  )}
                </div>
              )}

              {approvalState === "failed" && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <XCircle className="w-4 h-4" />
                  Approval failed — check console for details.
                </div>
              )}

              <p className="text-xs text-yellow-600">
                The policy owner signs this on their Ledger device. The ERC-7730 descriptor
                renders the transaction in plain English — no blind signing.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

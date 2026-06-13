/**
 * ENS + PolicyGuard client utilities.
 * Uses viem — plug in your wallet client for write operations.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  keccak256,
  toHex,
  parseAbi,
  type Address,
  type WalletClient,
  type Hash,
} from "viem";
import { sepolia } from "viem/chains";
import type { AllowancePolicy } from "./policySchema";

// ─────────────────────────────────────────────────────────────
// Constants — update after deploy
// ─────────────────────────────────────────────────────────────

export const ENS_PUBLIC_RESOLVER: Address =
  (process.env.NEXT_PUBLIC_ENS_RESOLVER as Address) ??
  "0x005fEc2fC3741D1ae1e487BB550A4b0F54263645";

export const POLICY_GUARD_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_POLICY_GUARD_ADDRESS as Address) ??
  "0x0000000000000000000000000000000000000000"; // ← replace after deploy

export const POLICY_ENS_KEY = "allowance.policy.v1";

// ─────────────────────────────────────────────────────────────
// Public client (read-only)
// ─────────────────────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.sepolia.org"),
});

// ─────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────

export const RESOLVER_ABI = parseAbi([
  "function text(bytes32 node, string key) external view returns (string)",
  "function setText(bytes32 node, string key, string value) external",
  "function addr(bytes32 node) external view returns (address)",
]);

export const POLICY_GUARD_ABI = parseAbi([
  "function updatePolicy(bytes32 namehash, bytes32 policyHash) external",
  "function getPolicyHash(bytes32 namehash) external view returns (bytes32)",
  "function getTodaySpend(bytes32 namehash) external view returns (uint256)",
  "function policyOwners(bytes32 namehash) external view returns (address)",
]);

// Full ABI with ParsedPolicy tuple — used by AgentSimulator for simulate/checkWithHumanApproval
const CAP_ABI      = { type: "tuple" as const, components: [{ name: "amount", type: "uint256" as const }, { name: "enabled", type: "bool" as const }] };
const TIMEWIN_ABI  = { type: "tuple" as const, components: [{ name: "start", type: "uint32" as const }, { name: "end", type: "uint32" as const }, { name: "enabled", type: "bool" as const }] };
const POLICY_TUPLE = {
  name: "policy", type: "tuple" as const,
  components: [
    { name: "dailyCap",           ...CAP_ABI  },
    { name: "approvalThreshold",  ...CAP_ABI  },
    { name: "perCounterpartyCap", ...CAP_ABI  },
    { name: "timeWindow",         ...TIMEWIN_ABI },
    { name: "allowlist",          type: "address[]" as const },
    { name: "allowlistEnabled",   type: "bool" as const },
  ],
} as const;

const POLICY_INPUTS = [
  { name: "namehash_",  type: "bytes32" as const },
  { name: "target",     type: "address" as const },
  { name: "value",      type: "uint256" as const },
  { name: "data",       type: "bytes"   as const },
  POLICY_TUPLE,
  { name: "policyJson", type: "string"  as const },
] as const;

export const POLICY_GUARD_FULL_ABI = [
  {
    name: "simulate", type: "function" as const, stateMutability: "view" as const,
    inputs: POLICY_INPUTS,
    outputs: [{ name: "allowed", type: "bool" as const }, { name: "reason", type: "string" as const }],
  },
  {
    name: "checkWithHumanApproval", type: "function" as const, stateMutability: "nonpayable" as const,
    inputs: [...POLICY_INPUTS, { name: "humanSig", type: "bytes" as const }],
    outputs: [{ name: "", type: "bool" as const }],
  },
  {
    name: "getApprovalDigest", type: "function" as const, stateMutability: "view" as const,
    inputs: [
      { name: "namehash_",  type: "bytes32" as const },
      { name: "target",     type: "address" as const },
      { name: "value",      type: "uint256" as const },
      { name: "policyJson", type: "string"  as const },
    ],
    outputs: [{ name: "", type: "bytes32" as const }],
  },
  {
    name: "updatePolicy", type: "function" as const, stateMutability: "nonpayable" as const,
    inputs: [{ name: "namehash_", type: "bytes32" as const }, { name: "policyHash", type: "bytes32" as const }],
    outputs: [],
  },
  {
    name: "getTodaySpend", type: "function" as const, stateMutability: "view" as const,
    inputs: [{ name: "namehash_", type: "bytes32" as const }],
    outputs: [{ name: "", type: "uint256" as const }],
  },
] as const;

// ─────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────

/** Fetch the raw policy JSON string from an ENS name's text record */
export async function fetchPolicyFromENS(ensName: string): Promise<string | null> {
  try {
    const node = namehash(ensName);
    const value = await publicClient.readContract({
      address: ENS_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "text",
      args: [node, POLICY_ENS_KEY],
    });
    return value || null;
  } catch {
    return null;
  }
}

/** Parse the JSON from ENS into an AllowancePolicy */
export async function fetchPolicy(ensName: string): Promise<AllowancePolicy | null> {
  const raw = await fetchPolicyFromENS(ensName);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AllowancePolicy;
  } catch {
    return null;
  }
}

/** Fetch the on-chain stored policy hash from PolicyGuard */
export async function fetchOnChainPolicyHash(ensName: string): Promise<`0x${string}` | null> {
  if (POLICY_GUARD_ADDRESS === "0x0000000000000000000000000000000000000000") return null;
  try {
    const node = namehash(ensName);
    const hash = await publicClient.readContract({
      address: POLICY_GUARD_ADDRESS,
      abi: POLICY_GUARD_ABI,
      functionName: "getPolicyHash",
      args: [node],
    });
    return hash as `0x${string}`;
  } catch {
    return null;
  }
}

/** Compute the keccak256 hash of a policy JSON string — must match PolicyGuard */
export function computePolicyHash(policyJson: string): `0x${string}` {
  return keccak256(toHex(policyJson));
}

// ─────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────

export interface PublishPolicyResult {
  ensTxHash: Hash;
  guardTxHash: Hash | null;
  policyHash: `0x${string}`;
}

/**
 * Publish a policy to ENS and register its hash in PolicyGuard.
 * Requires a connected WalletClient.
 *
 * Steps:
 *  1. Stringify + validate the policy JSON
 *  2. Write the JSON to the ENS text record
 *  3. Register the keccak256 hash in PolicyGuard
 */
export async function publishPolicy(
  walletClient: WalletClient,
  ensName: string,
  policy: AllowancePolicy
): Promise<PublishPolicyResult> {
  const policyJson = JSON.stringify(policy);
  const policyHash = computePolicyHash(policyJson);
  const node = namehash(ensName);

  const account = walletClient.account;
  if (!account) throw new Error("No account connected");

  // Step 1: Write to ENS resolver
  const ensTxHash = await walletClient.writeContract({
    address: ENS_PUBLIC_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: "setText",
    args: [node, POLICY_ENS_KEY, policyJson],
    account,
    chain: sepolia,
  });

  // Step 2: Register hash in PolicyGuard (skip if not deployed yet)
  let guardTxHash: Hash | null = null;
  if (POLICY_GUARD_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    guardTxHash = await walletClient.writeContract({
      address: POLICY_GUARD_ADDRESS,
      abi: POLICY_GUARD_ABI,
      functionName: "updatePolicy",
      args: [node, policyHash],
      account,
      chain: sepolia,
    });
  }

  return { ensTxHash, guardTxHash, policyHash };
}

// ─────────────────────────────────────────────────────────────
// Formatting utils
// ─────────────────────────────────────────────────────────────

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatPolicyForDisplay(policy: AllowancePolicy): {
  rules: { label: string; value: string; type: "cap" | "allowlist" | "time" | "approval" | "expiry" }[];
} {
  const rules: ReturnType<typeof formatPolicyForDisplay>["rules"] = [];

  if (policy.dailyCap) {
    rules.push({
      label: "Daily Cap",
      value: `${policy.dailyCap.amount} ${policy.dailyCap.token}`,
      type: "cap",
    });
  }

  if (policy.approvalThreshold) {
    rules.push({
      label: "Human Approval Above",
      value: `${policy.approvalThreshold.amount} ${policy.approvalThreshold.token}`,
      type: "approval",
    });
  }

  if (policy.allowlist && policy.allowlist.length > 0) {
    rules.push({
      label: "Allowlist",
      value: policy.allowlist.map(shortenAddress).join(", "),
      type: "allowlist",
    });
  }

  if (policy.timeWindow) {
    rules.push({
      label: "Time Window",
      value: `${policy.timeWindow.start} – ${policy.timeWindow.end} ${policy.timeWindow.timezone}`,
      type: "time",
    });
  }

  if (policy.perCounterpartyCap) {
    rules.push({
      label: "Per-Contract Cap",
      value: `${policy.perCounterpartyCap.amount} ${policy.perCounterpartyCap.token} / day`,
      type: "cap",
    });
  }

  if (policy.expiresAt) {
    rules.push({
      label: "Expires",
      value: new Date(policy.expiresAt).toLocaleDateString(),
      type: "expiry",
    });
  }

  return { rules };
}

/**
 * Shared config for all demo scripts.
 *
 * Policy enforcement flow:
 *   1. simulate() — view, no state change, shows allowed/reason
 *   2. check()    — enforcing, updates daily spend accumulator
 *   3. execute    — the actual Uniswap swap (only if check passed)
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  keccak256,
  toHex,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// ── Wallet ────────────────────────────────────────────────────
// Replace with a funded Sepolia test key — NEVER use a real key here
const PRIVATE_KEY = (process.env.PRIVATE_KEY ?? "") as `0x${string}`;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");

export const account = privateKeyToAccount(PRIVATE_KEY);

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org";

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC),
});

export const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(RPC),
});

// ── Contracts ─────────────────────────────────────────────────
export const POLICY_GUARD = "0x95028D3bFb24c168E55bEead6FFd3AeA2851c4dA" as Address;
export const ENS_NAME = "traderbot.eth";
export const ENS_NODE = namehash(ENS_NAME);

// Uniswap addresses (these are the allowlisted targets in the policy)
export const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as Address;
export const UNISWAP_UNIVERSAL = "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD" as Address;
export const RANDOM_ADDRESS    = "0x000000000000000000000000000000000000dEaD" as Address;

// ── Policy ────────────────────────────────────────────────────
export function usdcToWei(amount: number): bigint {
  return parseUnits(amount.toString(), 18);
}

const ENS_RESOLVER_ABI = [
  { name: "text", type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }],
    outputs: [{ name: "", type: "string" }] },
] as const;

// Fetches the exact policy JSON from ENS — guaranteed to match the stored hash.
export async function loadPolicyJson(): Promise<string> {
  const raw = await publicClient.readContract({
    address: "0xdc58Fa0E2915579b0679ee9c6dDd328b47e90c99" as Address,
    abi: ENS_RESOLVER_ABI,
    functionName: "text",
    args: [ENS_NODE, "allowance.policy.v1"],
  });
  if (!raw) throw new Error("No policy found in ENS for traderbot.eth");
  return raw as string;
}

// Parses the live ENS policy JSON into the ParsedPolicy struct the contract expects.
export function buildParsedPolicyFromJson(json: string) {
  const p = JSON.parse(json) as {
    dailyCap?: { amount: number };
    approvalThreshold?: { amount: number };
    timeWindow?: { start: string; end: string };
    allowlist?: string[];
  };

  const parseTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h ?? 0) * 3600 + (m ?? 0) * 60;
  };

  return {
    dailyCap:           { amount: usdcToWei(p.dailyCap?.amount ?? 0),          enabled: !!p.dailyCap },
    approvalThreshold:  { amount: usdcToWei(p.approvalThreshold?.amount ?? 0), enabled: !!p.approvalThreshold },
    perCounterpartyCap: { amount: 0n, enabled: false },
    timeWindow: {
      start:   p.timeWindow ? parseTime(p.timeWindow.start) : 0,
      end:     p.timeWindow ? parseTime(p.timeWindow.end)   : 86400,
      enabled: !!p.timeWindow,
    },
    allowlist:        (p.allowlist ?? []) as Address[],
    allowlistEnabled: (p.allowlist?.length ?? 0) > 0,
  };
}

// ── ABIs ──────────────────────────────────────────────────────
// ParsedPolicy is a single tuple struct in Solidity — must be encoded as one
// tuple arg, not flattened. Matches PolicyGuard.sol's ParsedPolicy struct.
const CAP = { type: "tuple", components: [{ name: "amount", type: "uint256" }, { name: "enabled", type: "bool" }] } as const;
const TIME = { type: "tuple", components: [{ name: "start", type: "uint32" }, { name: "end", type: "uint32" }, { name: "enabled", type: "bool" }] } as const;

const POLICY_TUPLE = {
  name: "policy", type: "tuple",
  components: [
    { name: "dailyCap",           ...CAP  },
    { name: "approvalThreshold",  ...CAP  },
    { name: "perCounterpartyCap", ...CAP  },
    { name: "timeWindow",         ...TIME },
    { name: "allowlist",          type: "address[]" },
    { name: "allowlistEnabled",   type: "bool"      },
  ],
} as const;

const POLICY_INPUTS = [
  { name: "namehash_", type: "bytes32" },
  { name: "target",    type: "address" },
  { name: "value",     type: "uint256" },
  { name: "data",      type: "bytes"   },
  POLICY_TUPLE,
  { name: "policyJson", type: "string" },
] as const;

export const GUARD_ABI = [
  {
    name: "simulate", type: "function", stateMutability: "view",
    inputs: POLICY_INPUTS,
    outputs: [{ name: "allowed", type: "bool" }, { name: "reason", type: "string" }],
  },
  {
    name: "check", type: "function", stateMutability: "nonpayable",
    inputs: POLICY_INPUTS,
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getTodaySpend", type: "function", stateMutability: "view",
    inputs: [{ name: "namehash_", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Custom errors — lets viem decode revert reasons
  { name: "PolicyNotSet",                type: "error", inputs: [{ name: "namehash", type: "bytes32" }] },
  { name: "PolicyHashMismatch",          type: "error", inputs: [{ name: "expected", type: "bytes32" }, { name: "got", type: "bytes32" }] },
  { name: "ExceedsDailyCap",             type: "error", inputs: [{ name: "amount", type: "uint256" }, { name: "cap", type: "uint256" }] },
  { name: "TargetNotAllowlisted",        type: "error", inputs: [{ name: "target", type: "address" }] },
  { name: "OutsideTimeWindow",           type: "error", inputs: [{ name: "currentTime", type: "uint256" }, { name: "start", type: "uint256" }, { name: "end", type: "uint256" }] },
  { name: "ExceedsApprovalThreshold",   type: "error", inputs: [{ name: "amount", type: "uint256" }, { name: "threshold", type: "uint256" }] },
  { name: "ExceedsPerCounterpartyCap",  type: "error", inputs: [{ name: "target", type: "address" }, { name: "amount", type: "uint256" }, { name: "cap", type: "uint256" }] },
] as const;

// ── Helpers ───────────────────────────────────────────────────
export function buildSimulateArgs(policyJson: string, target: Address, valueUsdc: number, data = "0x" as `0x${string}`) {
  const p = buildParsedPolicyFromJson(policyJson);
  return {
    address: POLICY_GUARD,
    abi: GUARD_ABI,
    functionName: "simulate" as const,
    args: [ENS_NODE, target, usdcToWei(valueUsdc), data, p, policyJson] as const,
  };
}

export function buildCheckArgs(policyJson: string, target: Address, valueUsdc: number, data = "0x" as `0x${string}`) {
  const p = buildParsedPolicyFromJson(policyJson);
  return {
    address: POLICY_GUARD,
    abi: GUARD_ABI,
    functionName: "check" as const,
    args: [ENS_NODE, target, usdcToWei(valueUsdc), data, p, policyJson] as const,
  };
}

export function box(title: string) {
  const line = "─".repeat(60);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${title.padEnd(58)}│`);
  console.log(`└${line}┘`);
}

export async function printDailySpend() {
  const spend = await publicClient.readContract({
    address: POLICY_GUARD,
    abi: GUARD_ABI,
    functionName: "getTodaySpend",
    args: [ENS_NODE],
  });
  const usdc = Number(spend) / 1e18;
  console.log(`  Today's spend: $${usdc.toFixed(2)} / $50.00 USDC`);
}

export async function simulate(policyJson: string, target: Address, valueUsdc: number, label: string) {
  console.log(`\n  → simulate: ${label} ($${valueUsdc} USDC to ${target.slice(0, 10)}…)`);
  const result = await publicClient.readContract(buildSimulateArgs(policyJson, target, valueUsdc));
  const [allowed, reason] = result as [boolean, string];
  if (allowed) {
    console.log(`  ✅ ALLOWED`);
  } else {
    console.log(`  ❌ BLOCKED — ${reason}`);
  }
  return { allowed, reason };
}

export async function enforce(policyJson: string, target: Address, valueUsdc: number, label: string) {
  console.log(`\n  → enforce: ${label} ($${valueUsdc} USDC)`);
  try {
    const hash = await walletClient.writeContract(buildCheckArgs(policyJson, target, valueUsdc));
    console.log(`  ✅ check() passed — tx: ${hash}`);
    return hash;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const named = msg.match(/The contract function "check" reverted\.[\s\S]*?Error: (\w+)\(/);
    const sig = msg.match(/following signature:\s*(0x[0-9a-f]+)/i);
    const errorName = named?.[1] ?? sig?.[1] ?? msg.slice(0, 80);
    console.log(`  ❌ check() reverted — ${errorName}`);
    return null;
  }
}

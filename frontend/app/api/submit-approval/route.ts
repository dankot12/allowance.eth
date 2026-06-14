import { NextRequest, NextResponse } from "next/server";
import {
  createWalletClient,
  createPublicClient,
  http,
  namehash,
  parseUnits,
  keccak256,
  toHex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const POLICY_GUARD_ADDRESS = (process.env.NEXT_PUBLIC_POLICY_GUARD_ADDRESS ??
  "0x6912A1247952dd082839d93c79f6e64c5898F939") as Address;

const ENS_RESOLVER = (process.env.NEXT_PUBLIC_ENS_RESOLVER ??
  "0xdc58Fa0E2915579b0679ee9c6dDd328b47e90c99") as Address;

const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.drpc.org";

const CAP_ABI      = { type: "tuple" as const, components: [{ name: "amount", type: "uint256" as const }, { name: "enabled", type: "bool" as const }] };
const TIMEWIN_ABI  = { type: "tuple" as const, components: [{ name: "start", type: "uint32" as const }, { name: "end", type: "uint32" as const }, { name: "enabled", type: "bool" as const }] };
const POLICY_TUPLE = {
  name: "policy", type: "tuple" as const,
  components: [
    { name: "dailyCap",           ...CAP_ABI },
    { name: "approvalThreshold",  ...CAP_ABI },
    { name: "perCounterpartyCap", ...CAP_ABI },
    { name: "timeWindow",         ...TIMEWIN_ABI },
    { name: "allowlist",          type: "address[]" as const },
    { name: "allowlistEnabled",   type: "bool" as const },
  ],
} as const;

const CHECK_APPROVAL_ABI = [
  {
    name: "checkWithHumanApproval",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "namehash_",  type: "bytes32" as const },
      { name: "target",     type: "address" as const },
      { name: "value",      type: "uint256" as const },
      { name: "data",       type: "bytes"   as const },
      POLICY_TUPLE,
      { name: "policyJson", type: "string"  as const },
      { name: "humanSig",   type: "bytes"   as const },
    ],
    outputs: [{ name: "", type: "bool" as const }],
  },
  { name: "humanApprovers",   type: "function" as const, stateMutability: "view" as const,
    inputs: [{ name: "namehash_", type: "bytes32" as const }], outputs: [{ name: "", type: "address" as const }] },
  { name: "policyOwners",     type: "function" as const, stateMutability: "view" as const,
    inputs: [{ name: "namehash_", type: "bytes32" as const }], outputs: [{ name: "", type: "address" as const }] },
  { name: "InvalidSignature", type: "error" as const, inputs: [] },
  { name: "PolicyHashMismatch", type: "error" as const, inputs: [{ name: "expected", type: "bytes32" as const }, { name: "got", type: "bytes32" as const }] },
  { name: "PolicyNotSet",     type: "error" as const, inputs: [{ name: "namehash", type: "bytes32" as const }] },
  { name: "OutsideTimeWindow", type: "error" as const, inputs: [{ name: "currentTime", type: "uint256" as const }, { name: "start", type: "uint32" as const }, { name: "end", type: "uint32" as const }] },
  { name: "ExceedsDailyCap", type: "error" as const, inputs: [{ name: "amount", type: "uint256" as const }, { name: "cap", type: "uint256" as const }] },
  { name: "TargetNotAllowlisted", type: "error" as const, inputs: [{ name: "target", type: "address" as const }] },
] as const;

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return ((h ?? 0) * 3600) + ((m ?? 0) * 60);
}

function parseTimeToUtcSeconds(timeStr: string, timezone: string): number {
  const localSeconds = parseTime(timeStr);
  try {
    const now = new Date();
    const utcMs = new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
    const tzMs  = new Date(now.toLocaleString("en-US", { timeZone: timezone })).getTime();
    const offsetSeconds = (tzMs - utcMs) / 1000;
    return ((localSeconds - offsetSeconds) % 86400 + 86400) % 86400;
  } catch {
    return localSeconds;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ensName, target, value, humanSig } = await req.json() as {
      ensName: string;
      target: string;
      value: number;
      humanSig: string;
    };

    if (!ensName || !target || value === undefined || !humanSig) {
      return NextResponse.json({ error: "Missing fields: ensName, target, value, humanSig" }, { status: 400 });
    }

    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) return NextResponse.json({ error: "PRIVATE_KEY not set" }, { status: 500 });

    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) });
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpc) });

    // Fetch policy JSON from ENS
    const node = namehash(ensName);
    const policyJson = await publicClient.readContract({
      address: ENS_RESOLVER,
      abi: [{ name: "text", type: "function", stateMutability: "view",
               inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }],
               outputs: [{ name: "", type: "string" }] }] as const,
      functionName: "text",
      args: [node, "allowance.policy.v1"],
    }) as string;

    if (!policyJson) return NextResponse.json({ error: "No policy in ENS for " + ensName }, { status: 400 });

    const policy = JSON.parse(policyJson) as {
      dailyCap?: { amount: number };
      approvalThreshold?: { amount: number };
      allowlist?: string[];
      timeWindow?: { start: string; end: string; timezone: string };
    };

    const tz = policy.timeWindow?.timezone ?? "UTC";
    const parsedPolicy = {
      dailyCap:           { amount: parseUnits((policy.dailyCap?.amount ?? 0).toString(), 18), enabled: !!policy.dailyCap },
      approvalThreshold:  { amount: parseUnits((policy.approvalThreshold?.amount ?? 0).toString(), 18), enabled: !!policy.approvalThreshold },
      perCounterpartyCap: { amount: BigInt(0), enabled: false },
      timeWindow: {
        start:   policy.timeWindow ? parseTimeToUtcSeconds(policy.timeWindow.start, tz) : 0,
        end:     policy.timeWindow ? parseTimeToUtcSeconds(policy.timeWindow.end, tz)   : 86400,
        enabled: !!policy.timeWindow,
      },
      allowlist:        (policy.allowlist ?? []) as Address[],
      allowlistEnabled: (policy.allowlist?.length ?? 0) > 0,
    };

    // Pre-flight: check humanApprover is set, otherwise InvalidSignature is guaranteed
    const onChainApprover = await publicClient.readContract({
      address: POLICY_GUARD_ADDRESS,
      abi: CHECK_APPROVAL_ABI,
      functionName: "humanApprovers",
      args: [node],
    }) as string;
    const policyOwner = await publicClient.readContract({
      address: POLICY_GUARD_ADDRESS,
      abi: CHECK_APPROVAL_ABI,
      functionName: "policyOwners",
      args: [node],
    }) as string;
    if (onChainApprover === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({
        error: `humanApprover not set. Call setHumanApprover(${node}, <speculosAddress>) from ${policyOwner} first. Toggle Speculos mode in the Agent Simulator and click "Authorize Ledger as approver".`,
      }, { status: 400 });
    }

    const txHash = await walletClient.writeContract({
      address: POLICY_GUARD_ADDRESS,
      abi: CHECK_APPROVAL_ABI,
      functionName: "checkWithHumanApproval",
      args: [
        node,
        target as Address,
        parseUnits(value.toString(), 18),
        "0x",
        parsedPolicy,
        policyJson,
        humanSig as `0x${string}`,
      ],
    });

    return NextResponse.json({ txHash });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("submit-approval error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

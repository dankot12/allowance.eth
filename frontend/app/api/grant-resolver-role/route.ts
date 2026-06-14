import { NextRequest, NextResponse } from "next/server";
import {
  createWalletClient,
  createPublicClient,
  http,
  isAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const RESOLVER = "0xdc58Fa0E2915579b0679ee9c6dDd328b47e90c99" as Address;
const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.drpc.org";

// All leaf write roles from PermissionedResolverLib ORed together:
// ROLE_SET_ADDR(0)|ROLE_SET_TEXT(4)|ROLE_SET_CONTENTHASH(8)|ROLE_SET_PUBKEY(12)|
// ROLE_SET_ABI(16)|ROLE_SET_INTERFACE(20)|ROLE_SET_NAME(24)|ROLE_CLEAR(32)|ROLE_SET_DATA(36)
const USER_ROLE_BITMAP = BigInt("73032339729");

const RESOLVER_ABI = [
  {
    name: "authorizeNameRoles",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "toName", type: "bytes" },
      { name: "roleBitmap", type: "uint256" },
      { name: "account", type: "address" },
      { name: "grant", type: "bool" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "roles",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "resource", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** DNS wire-format encoding: each label prefixed by its byte length, terminated by 0x00 */
function dnsEncode(name: string): `0x${string}` {
  const labels = name.toLowerCase().split(".");
  const parts: number[] = [];
  for (const label of labels) {
    const bytes = Array.from(Buffer.from(label, "utf8"));
    parts.push(bytes.length, ...bytes);
  }
  parts.push(0);
  return `0x${Buffer.from(parts).toString("hex")}` as `0x${string}`;
}

export async function POST(req: NextRequest) {
  try {
    const { ensName, account } = await req.json() as { ensName: string; account: string };

    if (!ensName || !account) {
      return NextResponse.json({ error: "Missing fields: ensName, account" }, { status: 400 });
    }
    if (!isAddress(account)) {
      return NextResponse.json({ error: "account is not a valid address" }, { status: 400 });
    }

    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) return NextResponse.json({ error: "PRIVATE_KEY not set" }, { status: 500 });

    const relayerAccount = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) });
    const walletClient = createWalletClient({ account: relayerAccount, chain: sepolia, transport: http(rpc) });

    const toName = dnsEncode(ensName);

    const txHash = await walletClient.writeContract({
      address: RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "authorizeNameRoles",
      args: [toName, USER_ROLE_BITMAP, account as Address, true],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return NextResponse.json({
      txHash,
      ensName,
      account,
      roleBitmap: USER_ROLE_BITMAP.toString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("grant-resolver-role error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

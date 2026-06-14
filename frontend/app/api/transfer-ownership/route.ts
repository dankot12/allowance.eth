import { NextRequest, NextResponse } from "next/server";
import {
  createWalletClient,
  createPublicClient,
  http,
  namehash,
  isAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const POLICY_GUARD_ADDRESS = (process.env.NEXT_PUBLIC_POLICY_GUARD_ADDRESS ??
  "0x6912A1247952dd082839d93c79f6e64c5898F939") as Address;

const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.drpc.org";

const GUARD_ABI = [
  { name: "policyOwners", type: "function", stateMutability: "view",
    inputs: [{ name: "namehash_", type: "bytes32" }], outputs: [{ name: "", type: "address" }] },
  { name: "transferPolicyOwnership", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "namehash_", type: "bytes32" }, { name: "newOwner", type: "address" }], outputs: [] },
  { name: "Unauthorized", type: "error", inputs: [] },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Transfers PolicyGuard ownership of an agent identity to a new wallet.
 * Only works when the backend relayer (PRIVATE_KEY) is the CURRENT policy owner —
 * i.e. the agent identity is currently held by the deployer/relayer and is being
 * handed off to a user wallet. If a user wallet is already the owner, they must
 * transfer it themselves via MetaMask (the relayer cannot move someone else's name).
 */
export async function POST(req: NextRequest) {
  try {
    const { ensName, newOwner } = await req.json() as { ensName: string; newOwner: string };

    if (!ensName || !newOwner) {
      return NextResponse.json({ error: "Missing fields: ensName, newOwner" }, { status: 400 });
    }
    if (!isAddress(newOwner)) {
      return NextResponse.json({ error: "newOwner is not a valid address" }, { status: 400 });
    }

    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) return NextResponse.json({ error: "PRIVATE_KEY not set" }, { status: 500 });

    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) });
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpc) });

    const node = namehash(ensName);

    const currentOwner = await publicClient.readContract({
      address: POLICY_GUARD_ADDRESS, abi: GUARD_ABI,
      functionName: "policyOwners", args: [node],
    }) as Address;

    if (currentOwner === ZERO) {
      return NextResponse.json({
        error: `No policy registered for ${ensName} on PolicyGuard. Publish a policy first.`,
        relayer: account.address,
      }, { status: 400 });
    }

    // The relayer can only transfer if IT is the current owner.
    if (currentOwner.toLowerCase() !== account.address.toLowerCase()) {
      return NextResponse.json({
        error: `Relayer (${account.address}) is not the current owner of ${ensName}. Current owner is ${currentOwner}. Connect that wallet and transfer via MetaMask.`,
        currentOwner,
        relayer: account.address,
      }, { status: 403 });
    }

    if (newOwner.toLowerCase() === currentOwner.toLowerCase()) {
      return NextResponse.json({ error: "newOwner is already the current owner — nothing to do." }, { status: 400 });
    }

    const txHash = await walletClient.writeContract({
      address: POLICY_GUARD_ADDRESS, abi: GUARD_ABI,
      functionName: "transferPolicyOwnership",
      args: [node, newOwner as Address],
    });

    // Wait for confirmation so the UI can read the new owner immediately
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const verifiedOwner = await publicClient.readContract({
      address: POLICY_GUARD_ADDRESS, abi: GUARD_ABI,
      functionName: "policyOwners", args: [node],
    }) as Address;

    return NextResponse.json({ txHash, previousOwner: currentOwner, newOwner: verifiedOwner });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("transfer-ownership error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

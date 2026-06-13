import "dotenv/config";
import { createPublicClient, http, namehash, parseAbi, keccak256, toHex } from "viem";
import { sepolia } from "viem/chains";

const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });
const node = namehash("traderbot.eth");

async function main() {
  const raw = await client.readContract({
    address: "0xdc58Fa0E2915579b0679ee9c6dDd328b47e90c99",
    abi: parseAbi(["function text(bytes32,string) returns (string)"]),
    functionName: "text",
    args: [node, "allowance.policy.v1"],
  });
  console.log("ENS stored JSON:\n", raw);

  const stored = await client.readContract({
    address: "0x95028D3bFb24c168E55bEead6FFd3AeA2851c4dA",
    abi: parseAbi(["function getPolicyHash(bytes32) returns (bytes32)"]),
    functionName: "getPolicyHash",
    args: [node],
  });
  console.log("\nPolicyGuard stored hash:", stored);

  const computed = keccak256(toHex(raw as string));
  console.log("Hash of ENS JSON:       ", computed);
  console.log("Match:", stored === computed);
}

main().catch(console.error);

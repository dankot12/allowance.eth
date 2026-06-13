/**
 * Demo 05 — ExceedsApprovalThreshold → Human Ledger Approval → Success
 *
 * Flow:
 *   1. simulate($35) → blocked: ExceedsApprovalThreshold (policy cap is $30)
 *   2. Human (policy owner) signs an approval digest — on a real Ledger device, the
 *      ERC-7730 descriptor renders this as human-readable clear signing.
 *      In this demo, the agent wallet IS the policy owner for simplicity.
 *   3. checkWithHumanApproval($35, sig) → approved and spend recorded.
 *
 * The signature is day-scoped (expires at UTC midnight) and covers
 * keccak256(abi.encode(namehash, target, value, keccak256(policyJson), day)).
 * A replay on the next day or for a different amount/target is rejected.
 */

import {
  box, printDailySpend, simulate,
  loadPolicyJson, buildParsedPolicyFromJson,
  POLICY_GUARD, ENS_NODE, UNISWAP_V3_ROUTER, usdcToWei,
  GUARD_ABI, walletClient, publicClient, account,
} from "./_config.js";

async function getApprovalDigest(
  policyJson: string,
  valueUsdc: number,
): Promise<`0x${string}`> {
  return await publicClient.readContract({
    address: POLICY_GUARD,
    abi: GUARD_ABI,
    functionName: "getApprovalDigest",
    args: [ENS_NODE, UNISWAP_V3_ROUTER, usdcToWei(valueUsdc), policyJson],
  }) as `0x${string}`;
}

async function ledgerApprove(amount: number, policyJson: string): Promise<`0x${string}`> {
  console.log(`
  ┌─────────────────────────────────────────────────────┐
  │  🔐  LEDGER APPROVAL REQUIRED                       │
  │                                                     │
  │  Agent wants to execute:  Swap $${String(amount).padEnd(6)} USDC on Uniswap │
  │  Exceeds auto-approve limit of $30.                 │
  │                                                     │
  │  [Human presses button on Ledger device]            │
  │  ERC-7730 clear signing: "Approve Agent Spend"      │
  └─────────────────────────────────────────────────────┘`);

  // Fetch the exact digest the contract will verify against
  const digest = await getApprovalDigest(policyJson, amount);
  console.log(`  Approval digest: ${digest.slice(0, 18)}…`);

  // signMessage adds \x19Ethereum Signed Message:\n32 prefix — matches _approvalDigest in contract
  const sig = await walletClient.signMessage({ message: { raw: digest } });
  console.log(`  Signature:       ${sig.slice(0, 20)}… (${sig.length / 2 - 1} bytes)`);
  console.log(`  Signer:          ${account.address}`);
  return sig;
}

async function main() {
  box("DEMO 05 — Approval Threshold: simulate FAIL → Ledger sign → check PASS");

  const policyJson = await loadPolicyJson();
  console.log("  Policy loaded from ENS ✓");
  await printDailySpend();

  // Step 1: simulate shows the block reason
  const { allowed, reason } = await simulate(policyJson, UNISWAP_V3_ROUTER, 35, "$35 swap");

  if (allowed) {
    console.log("\n  Unexpected: simulate returned allowed. Policy may have changed.");
    return;
  }

  if (!reason.includes("Approval")) {
    console.log(`\n  Blocked for a different reason: ${reason}`);
    console.log("  (Run scripts 01+02 first if this is ExceedsDailyCap)");
    return;
  }

  // Step 2: human signs approval on Ledger
  const humanSig = await ledgerApprove(35, policyJson);

  // Step 3: checkWithHumanApproval — skips threshold gate, enforces everything else
  console.log("\n  → checkWithHumanApproval($35 USDC, Ledger sig)…");
  const policy = buildParsedPolicyFromJson(policyJson);
  try {
    const hash = await walletClient.writeContract({
      address: POLICY_GUARD,
      abi: GUARD_ABI,
      functionName: "checkWithHumanApproval",
      args: [ENS_NODE, UNISWAP_V3_ROUTER, usdcToWei(35), "0x", policy, policyJson, humanSig],
    });
    console.log(`  ✅ Human-approved — on-chain tx: ${hash}`);
    console.log(`     Agent can now execute the $35 Uniswap swap.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const named = msg.match(/Error: (\w+)\(/);
    console.log(`  ❌ checkWithHumanApproval reverted — ${named?.[1] ?? msg.slice(0, 100)}`);
    console.log(`     Note: if this is a fresh deploy, call updatePolicy() first.`);
  }

  console.log("\n  Spend after human-approved tx:");
  await printDailySpend();
}

main().catch(console.error);

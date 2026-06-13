import { box, printDailySpend, simulate, enforce, loadPolicyJson, UNISWAP_V3_ROUTER } from "./_config.js";

async function requestHumanApproval(amount: number): Promise<boolean> {
  console.log(`
  ┌─────────────────────────────────────────────┐
  │  🔐  LEDGER APPROVAL REQUIRED               │
  │                                             │
  │  Your AI agent wants to execute:            │
  │  Swap $${amount} USDC on Uniswap                  │
  │                                             │
  │  This exceeds the auto-approve limit.       │
  │  [Approve ✅]   [Reject ❌]                 │
  └─────────────────────────────────────────────┘`);
  console.log("  (Demo: auto-approving after 2s…)");
  await new Promise((r) => setTimeout(r, 2000));
  return true;
}

async function main() {
  box("FAIL → HUMAN APPROVAL — $35 USDC (exceeds approval threshold)");

  const policyJson = await loadPolicyJson();
  console.log("  Policy loaded from ENS ✓");
  await printDailySpend();

  const { allowed, reason } = await simulate(policyJson, UNISWAP_V3_ROUTER, 35, "$35 swap");

  if (!allowed && reason.includes("Approval")) {
    const approved = await requestHumanApproval(35);
    if (approved) {
      await enforce(policyJson, UNISWAP_V3_ROUTER, 35, "PolicyGuard.check() — human approved");
      console.log("\n  Spend after human-approved tx:");
      await printDailySpend();
    }
  }
}

main().catch(console.error);

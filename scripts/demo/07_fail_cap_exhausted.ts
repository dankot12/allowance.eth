import { box, printDailySpend, simulate, enforce, loadPolicyJson, UNISWAP_V3_ROUTER } from "./_config.js";

async function main() {
  box("FAIL #4 — Cap exhausted by cumulative spend");

  const policyJson = await loadPolicyJson();
  console.log("  Policy loaded from ENS ✓");
  console.log("  Run scripts 01 ($20) and 02 ($29) first to build up $49 of spend.");

  await printDailySpend();

  await simulate(policyJson, UNISWAP_V3_ROUTER, 10, "$10 — pushes total over cap");
  await enforce(policyJson, UNISWAP_V3_ROUTER, 10, "PolicyGuard.check()");

  await printDailySpend();
}

main().catch(console.error);

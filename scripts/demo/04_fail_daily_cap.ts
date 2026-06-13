import { box, printDailySpend, simulate, enforce, loadPolicyJson, UNISWAP_V3_ROUTER } from "./_config.js";

async function main() {
  box("FAIL #2 — ExceedsDailyCap ($60 vs $50 cap)");

  const policyJson = await loadPolicyJson();
  console.log("  Policy loaded from ENS ✓");
  await printDailySpend();

  await simulate(policyJson, UNISWAP_V3_ROUTER, 60, "$60 swap — over cap");
  await enforce(policyJson, UNISWAP_V3_ROUTER, 60, "PolicyGuard.check()");

  console.log("\n  Spend unchanged:");
  await printDailySpend();
}

main().catch(console.error);

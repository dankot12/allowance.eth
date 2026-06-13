import { box, printDailySpend, simulate, enforce, loadPolicyJson, RANDOM_ADDRESS } from "./_config.js";

async function main() {
  box("FAIL #1 — TargetNotAllowlisted ($20 to non-Uniswap address)");

  const policyJson = await loadPolicyJson();
  console.log("  Policy loaded from ENS ✓");
  await printDailySpend();

  await simulate(policyJson, RANDOM_ADDRESS, 20, "$20 to non-allowlisted address");
  await enforce(policyJson, RANDOM_ADDRESS, 20, "PolicyGuard.check()");

  console.log("\n  Spend unchanged (blocked before accumulator update):");
  await printDailySpend();
}

main().catch(console.error);

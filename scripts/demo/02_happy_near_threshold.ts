import { box, printDailySpend, simulate, enforce, loadPolicyJson, UNISWAP_UNIVERSAL } from "./_config.js";

async function main() {
  box("HAPPY PATH #2 — $29 USDC (just under $30 approval threshold)");

  const policyJson = await loadPolicyJson();
  console.log("  Policy loaded from ENS ✓");
  await printDailySpend();

  const { allowed } = await simulate(policyJson, UNISWAP_UNIVERSAL, 29, "$29 swap → Universal Router");
  if (!allowed) { console.log("\n  Blocked. Check if daily cap already used up."); return; }

  await enforce(policyJson, UNISWAP_UNIVERSAL, 29, "PolicyGuard.check()");

  console.log("\n  Updated spend:");
  await printDailySpend();
}

main().catch(console.error);

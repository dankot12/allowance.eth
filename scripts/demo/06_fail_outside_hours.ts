import {
  box, printDailySpend, publicClient, loadPolicyJson, buildParsedPolicyFromJson,
  POLICY_GUARD, ENS_NODE, UNISWAP_V3_ROUTER, usdcToWei, GUARD_ABI,
} from "./_config.js";

async function main() {
  box("FAIL #3 — OutsideTimeWindow");

  const policyJson = await loadPolicyJson();
  const policy = JSON.parse(policyJson) as { timeWindow?: { start: string; end: string } };
  console.log("  Policy loaded from ENS ✓");
  console.log(`  Time window: ${policy.timeWindow?.start ?? "none"} – ${policy.timeWindow?.end ?? "none"} UTC`);
  await printDailySpend();

  const now = new Date();
  const secondsInDay = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  console.log(`\n  Current UTC time: ${now.toUTCString()} (${secondsInDay}s)`);

  // Build a version of the policy with a 1-minute window at 23:58 to force the failure
  const parsed = buildParsedPolicyFromJson(policyJson);
  const outsidePolicy = { ...parsed, timeWindow: { start: 23 * 3600 + 58 * 60, end: 23 * 3600 + 59 * 60, enabled: true } };

  // Note: policyJson hash won't match the modified struct — so this returns PolicyHashMismatch,
  // not OutsideTimeWindow. For a live demo, run any script outside the policy's time window.
  const result = await publicClient.readContract({
    address: POLICY_GUARD,
    abi: GUARD_ABI,
    functionName: "simulate",
    args: [ENS_NODE, UNISWAP_V3_ROUTER, usdcToWei(20), "0x", outsidePolicy, policyJson],
  }) as [boolean, string];

  const [allowed, reason] = result;
  console.log(`\n  → simulate with 23:58-23:59 window: ${allowed ? "✅ ALLOWED" : `❌ BLOCKED — ${reason}`}`);
  console.log(`\n  ℹ️  PolicyHashMismatch is expected (we changed the window but not the stored hash).`);
  console.log(`     For a live OutsideTimeWindow failure: run any script outside the policy window.`);
}

main().catch(console.error);

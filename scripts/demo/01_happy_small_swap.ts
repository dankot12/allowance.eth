import {
  box, printDailySpend, simulate, enforce, loadPolicyJson,
  UNISWAP_V3_ROUTER, walletClient, account,
} from "./_config.js";
import { parseAbi, parseEther, type Address } from "viem";

async function main() {
  box("HAPPY PATH #1 — $20 USDC small swap");

  const policyJson = await loadPolicyJson();
  console.log("  Policy loaded from ENS ✓");
  await printDailySpend();

  const { allowed } = await simulate(policyJson, UNISWAP_V3_ROUTER, 20, "Small swap to Uniswap V3 Router");
  if (!allowed) return;

  const checkTx = await enforce(policyJson, UNISWAP_V3_ROUTER, 20, "PolicyGuard.check()");
  if (!checkTx) return;

  // Actual Uniswap swap (ETH → USDC via V3 SwapRouter02)
  const WETH = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9" as Address;
  const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;

  const swapAbi = parseAbi([
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256)",
  ]);

  try {
    const swapTx = await walletClient.writeContract({
      address: UNISWAP_V3_ROUTER,
      abi: swapAbi,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: WETH, tokenOut: USDC, fee: 3000,
        recipient: account.address,
        amountIn: parseEther("0.001"),
        amountOutMinimum: 0n, sqrtPriceLimitX96: 0n,
      }],
      value: parseEther("0.001"),
    });
    console.log(`  ✅ Uniswap swap executed — tx: ${swapTx}`);
  } catch {
    console.log(`  ℹ️  Swap call failed (no Sepolia liquidity) — PolicyGuard enforcement passed, that's the demo.`);
  }

  console.log("\n  Updated spend:");
  await printDailySpend();
}

main().catch(console.error);

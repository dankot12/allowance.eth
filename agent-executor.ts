/**
 * Allowance.eth — Agent Executor
 *
 * This script wraps any agent transaction with a PolicyGuard check.
 * Before firing any tx, it calls PolicyGuard.simulate() (read-only, no gas).
 * If the policy passes  → fires the real transaction.
 * If it needs approval  → prints a human-approval prompt and waits.
 * If it's blocked       → prints the reason and exits.
 *
 * Usage:
 *   # Swap 25 USDC on Uniswap
 *   npx ts-node agent-executor.ts \
 *     --ens allowance-test-123.eth \
 *     --to 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 \
 *     --value 0 \
 *     --data 0x...
 *
 * Environment variables (set in .env):
 *   PRIVATE_KEY               — agent's signing key
 *   POLICY_GUARD_ADDRESS      — deployed PolicyGuard address
 *   SEPOLIA_RPC_URL           — RPC endpoint
 *   POLICY_ENS_NAME           — agent's ENS name (or pass --ens flag)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  keccak256,
  toHex,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const PRIVATE_KEY         = process.env.PRIVATE_KEY as Hex;
const POLICY_GUARD_ADDR   = process.env.POLICY_GUARD_ADDRESS as Address;
const RPC_URL             = process.env.SEPOLIA_RPC_URL ?? 'https://rpc.sepolia.org';
const ENS_RESOLVER        = '0x005fEc2fC3741D1ae1e487BB550A4b0F54263645' as Address;
const POLICY_KEY          = 'allowance.policy.v1';

// ─────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────

const POLICY_GUARD_ABI = parseAbi([
  `function simulate(
      bytes32 namehash_,
      address target,
      uint256 value,
      bytes calldata data,
      ((uint256 amount, bool enabled) dailyCap,
       (uint256 amount, bool enabled) approvalThreshold,
       (uint256 amount, bool enabled) perCounterpartyCap,
       (uint32 start, uint32 end, bool enabled) timeWindow,
       address[] allowlist,
       bool allowlistEnabled) calldata policy,
      string calldata policyJson
    ) external view returns (bool allowed, string memory reason)`,
]);

const RESOLVER_ABI = parseAbi([
  'function text(bytes32 node, string key) external view returns (string)',
]);

// ─────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

// ─────────────────────────────────────────────────────────────
// Policy fetching
// ─────────────────────────────────────────────────────────────

interface Policy {
  version: string;
  name: string;
  dailyCap?:           { amount: number; token: string };
  approvalThreshold?:  { amount: number; token: string };
  perCounterpartyCap?: { amount: number; token: string };
  timeWindow?:         { start: string; end: string; timezone: string };
  allowlist?:          string[];
}

async function fetchPolicy(ensName: string): Promise<{ policy: Policy; json: string } | null> {
  const node = namehash(ensName);
  try {
    const raw = await publicClient.readContract({
      address: ENS_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: 'text',
      args: [node, POLICY_KEY],
    });
    if (!raw) return null;
    return { policy: JSON.parse(raw) as Policy, json: raw };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Policy → Solidity struct conversion
// ─────────────────────────────────────────────────────────────

const TOKEN_DECIMALS: Record<string, bigint> = {
  ETH:  10n ** 18n,
  WETH: 10n ** 18n,
  USDC: 10n ** 6n,
  USDT: 10n ** 6n,
  DAI:  10n ** 18n,
  WBTC: 10n ** 8n,
};

function toWei(amount: number, token: string): bigint {
  const decimals = TOKEN_DECIMALS[token] ?? 10n ** 18n;
  return BigInt(Math.round(amount * 1e6)) * (decimals / 1_000_000n);
}

function timeToSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60;
}

function buildParsedPolicy(policy: Policy) {
  return {
    dailyCap: policy.dailyCap
      ? { amount: toWei(policy.dailyCap.amount, policy.dailyCap.token), enabled: true }
      : { amount: 0n, enabled: false },
    approvalThreshold: policy.approvalThreshold
      ? { amount: toWei(policy.approvalThreshold.amount, policy.approvalThreshold.token), enabled: true }
      : { amount: 0n, enabled: false },
    perCounterpartyCap: policy.perCounterpartyCap
      ? { amount: toWei(policy.perCounterpartyCap.amount, policy.perCounterpartyCap.token), enabled: true }
      : { amount: 0n, enabled: false },
    timeWindow: policy.timeWindow
      ? {
          start: timeToSeconds(policy.timeWindow.start),
          end: timeToSeconds(policy.timeWindow.end),
          enabled: true,
        }
      : { start: 0, end: 0, enabled: false },
    allowlist: (policy.allowlist ?? []) as Address[],
    allowlistEnabled: !!(policy.allowlist && policy.allowlist.length > 0),
  };
}

// ─────────────────────────────────────────────────────────────
// Human approval prompt
// ─────────────────────────────────────────────────────────────

async function promptApproval(reason: string, target: string, value: bigint): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log('\n' + '─'.repeat(60));
    console.log('⚠️  HUMAN APPROVAL REQUIRED');
    console.log('─'.repeat(60));
    console.log(`Target : ${target}`);
    console.log(`Value  : ${value} wei`);
    console.log(`Reason : ${reason}`);
    console.log('─'.repeat(60));
    rl.question('Approve this transaction? (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Main executor
// ─────────────────────────────────────────────────────────────

async function execute({
  ensName,
  target,
  value,
  data,
}: {
  ensName: string;
  target: Address;
  value: bigint;
  data: Hex;
}) {
  console.log(`\n🔍 Fetching policy for ${ensName}...`);

  const result = await fetchPolicy(ensName);
  if (!result) {
    console.error('❌ No policy found. Agent is not configured.');
    process.exit(1);
  }

  const { policy, json: policyJson } = result;
  console.log(`✓ Policy loaded: "${policy.name}"`);

  if (!POLICY_GUARD_ADDR || POLICY_GUARD_ADDR === '0x0000000000000000000000000000000000000000') {
    console.warn('⚠️  POLICY_GUARD_ADDRESS not set — skipping on-chain enforcement (dev mode)');
    console.log('✅ Transaction would proceed (no guard)');
    return;
  }

  const node = namehash(ensName);
  const parsedPolicy = buildParsedPolicy(policy);

  console.log(`🔒 Simulating against PolicyGuard...`);
  console.log(`   Target : ${target}`);
  console.log(`   Value  : ${value} wei`);

  let allowed: boolean;
  let reason: string;

  try {
    [allowed, reason] = await publicClient.readContract({
      address: POLICY_GUARD_ADDR,
      abi: POLICY_GUARD_ABI,
      functionName: 'simulate',
      args: [node, target, value, data, parsedPolicy, policyJson],
    });
  } catch (err) {
    console.error('❌ PolicyGuard simulation failed:', err);
    process.exit(1);
  }

  // Case 1: needs human approval
  if (!allowed && reason.includes('NeedsHumanApproval')) {
    const approved = await promptApproval(reason, target, value);
    if (!approved) {
      console.log('❌ Human rejected the transaction.');
      process.exit(0);
    }
    console.log('✅ Human approved — proceeding...');
    // Fall through to fire tx
  } else if (!allowed) {
    // Case 2: hard block
    console.log('\n' + '─'.repeat(60));
    console.log('🚫 TRANSACTION BLOCKED BY POLICY');
    console.log('─'.repeat(60));
    console.log(`Reason: ${reason}`);
    console.log('─'.repeat(60));
    process.exit(1);
  } else {
    console.log('✅ Policy check passed — firing transaction...');
  }

  // Fire the real transaction
  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set.');
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  });

  const txHash = await walletClient.sendTransaction({
    to: target,
    value,
    data,
    account,
    chain: sepolia,
  });

  console.log(`\n🎉 Transaction sent!`);
  console.log(`   Hash: ${txHash}`);
  console.log(`   Explorer: https://sepolia.etherscan.io/tx/${txHash}`);
}

// ─────────────────────────────────────────────────────────────
// CLI arg parsing
// ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const ensName = get('--ens') ?? process.env.POLICY_ENS_NAME;
  const to      = get('--to');
  const value   = get('--value') ?? '0';
  const data    = get('--data')  ?? '0x';

  if (!ensName || !to) {
    console.error('Usage: ts-node agent-executor.ts --ens <name.eth> --to <address> [--value <wei>] [--data <hex>]');
    process.exit(1);
  }

  return {
    ensName,
    target: to as Address,
    value: BigInt(value),
    data: data as Hex,
  };
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

const args = parseArgs();
execute(args).catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

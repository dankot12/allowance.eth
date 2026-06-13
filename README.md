# Allowance.eth

> Portable, human-readable spending policies for AI agent wallets. Stored on ENS. Enforced on-chain.

## Architecture

```
User types English → Claude (sonnet-4-6) → validated JSON → ENS text record
                                                           ↘
                                                       PolicyGuard.sol (keccak hash)
                                                           ↙
                                       every agent tx → check() → APPROVE / REVERT
```

## Quickstart

### 1. Deploy PolicyGuard

```bash
# Install Foundry: https://getfoundry.sh
forge install

# Set env vars
cp .env.example .env
# Fill in PRIVATE_KEY, SEPOLIA_RPC_URL, ETHERSCAN_API_KEY

forge script script/DeployPolicyGuard.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY

# Copy the deployed address into frontend/.env.local as NEXT_PUBLIC_POLICY_GUARD_ADDRESS
```

### 2. Run tests

```bash
forge test -vvv
```

### 3. Start the frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Fill in ANTHROPIC_API_KEY, NEXT_PUBLIC_POLICY_GUARD_ADDRESS, NEXT_PUBLIC_RPC_URL
npm run dev  # → http://localhost:3000
```

---

## Project structure

```
allowance.eth/
├── src/PolicyGuard.sol                    ← On-chain policy enforcement
├── script/DeployPolicyGuard.s.sol
├── test/PolicyGuard.t.sol
├── setup-agent-read.ts                    ← Read ENS text record (viem)
├── setup-agent-write.ts                   ← Write ENS text record (viem)
└── frontend/
    ├── app/
    │   ├── page.tsx                       ← Policy authoring (home)
    │   ├── agent/page.tsx                 ← Agent activity log
    │   ├── profile/page.tsx               ← ENS profile viewer
    │   └── api/translate-policy/route.ts  ← Claude NL→JSON API
    └── lib/
        ├── policySchema.ts                ← Types, JSON Schema, validator
        └── ensClient.ts                   ← viem ENS + PolicyGuard helpers
```

---

## Policy schema (v1)

```jsonc
{
  "version": "1",
  "name": "My Agent Policy",
  "dailyCap": { "amount": 50, "token": "USDC" },           // max spend/day
  "allowlist": ["0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"], // allowed contracts
  "timeWindow": { "start": "09:00", "end": "17:00", "timezone": "UTC" },
  "approvalThreshold": { "amount": 30, "token": "USDC" },  // human approval above
  "perCounterpartyCap": { "amount": 20, "token": "USDC" }, // per-contract daily cap
  "expiresAt": "2024-12-31T23:59:59Z",
  "notes": "Human-readable description"
}
```

ENS text record key: `allowance.policy.v1`

---

## Plugging in sponsors

### Dynamic (wallet + agent signing)
In `frontend/app/components/PublishPanel.tsx`, replace the private-key block with:

```ts
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
const { primaryWallet } = useDynamicContext();
const walletClient = await primaryWallet.getWalletClient();
const result = await publishPolicy(walletClient, ensName, policy);
```

Add `DynamicContextProvider` wrapping `app/layout.tsx`.

### Ledger (ERC-7730 Clear Signing)

The descriptor is at `erc7730/PolicyGuard.json`. It covers three functions:
- `updatePolicy` — shows "POLICY UPDATE: Agent ENS Namehash / Policy Hash" on the device
- `check` — shows "AGENT REQUEST: Target / ETH Value" + "ACTIVE POLICY: Daily Cap / Approval Threshold"
- `transferPolicyOwnership` — shows "TRANSFER OWNERSHIP: Namehash / New Owner"

**Steps to activate it:**

1. After deploying PolicyGuard, update the address in `erc7730/PolicyGuard.json`:
   ```json
   "deployments": [{ "chainId": 11155111, "address": "0xYOUR_DEPLOYED_ADDRESS" }]
   ```

2. Install the Ledger ERC-7730 CLI:
   ```bash
   pip install ledger-erc7730
   ```

3. Validate your descriptor:
   ```bash
   erc7730 lint erc7730/PolicyGuard.json
   ```

4. Test against the Ledger Stax simulator:
   ```bash
   erc7730 test erc7730/PolicyGuard.json --device stax
   ```

5. For the hackathon demo, submit to the registry:
   ```bash
   # Fork https://github.com/LedgerHQ/clear-signing-erc7730-registry
   # Copy erc7730/PolicyGuard.json into registries/ethereum/sepolia/
   # Open a PR
   ```

**What the device shows (demo beats):**

When the user publishes a policy:
```
POLICY UPDATE
Agent ENS Namehash: 0xabc...
Policy Hash: 0xdef...
[Approve] [Reject]
```

When an agent transaction crosses the approval threshold:
```
AGENT REQUEST
Target: Uniswap Universal Router
ETH Value: 35.0 ETH

ACTIVE POLICY
Daily Cap: 50.0 ETH
Approval Threshold: 30.0 ETH
[Approve] [Reject]
```

### Agent Executor
Run `agent-executor.ts` to simulate the terminal demo beats:

```bash
# Happy path — 25 USDC to Uniswap, within cap
npx ts-node agent-executor.ts \
  --ens allowance-test-123.eth \
  --to 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 \
  --value 0 \
  --data 0x

# Blocked — 51 USDC exceeds daily cap
npx ts-node agent-executor.ts \
  --ens allowance-test-123.eth \
  --to 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 \
  --value 51000000 \
  --data 0x

# Needs human approval — 35 USDC above $30 threshold
npx ts-node agent-executor.ts \
  --ens allowance-test-123.eth \
  --to 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 \
  --value 35000000 \
  --data 0x
```

### EIP-7702 (EOA agent executor — stretch goal)
Use viem's `signAuthorization` + `sendTransaction` with `authorizationList` to delegate the EOA to a contract that calls `PolicyGuard.check()` before executing.

---

## ENS standards

- [ENSIP-25](https://docs.ens.domains/ensip/25) — AI Agent Registry
- [ENSIP-26](https://docs.ens.domains/ensip/26) — Agent Text Records
- Text record key: `allowance.policy.v1`

---

## Foundry reference

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```

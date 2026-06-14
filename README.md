# allowance.eth 💸

> Portable AI spending policies — rules live on the agent's ENS identity, not the wallet infrastructure.

AI agents need to spend crypto. Today, spending limits live in wallet configs, relayer settings, or offchain databases — swap infrastructure and you reconfigure from scratch. **allowance.eth** anchors the policy to the agent's ENS name instead. Transfer the name, the rules follow. Change wallets, the rules follow. Nothing resets.

Built for [EthGlobal NYC 2026](https://ethglobal.com).

---

## How it works

```
Natural language  →  Claude (claude-sonnet-4-6)  →  validated JSON policy
                                                          │
                                              ┌───────────┴────────────┐
                                         ENS text record          PolicyGuard.sol
                                     (allowance.policy.v1)       (keccak256 hash)
                                              │                         │
                                         Agent reads                Every tx →
                                         policy from               simulate() →
                                         the ENS name           ALLOW / BLOCK / APPROVE
```

Every agent transaction is checked on-chain against three gates:

1. **Daily cap** — rolling spend limit per token
2. **Allowlist** — only whitelisted contracts can be called
3. **Human approval** — transactions above a threshold require a Ledger signature

The policy travels with the ENS name. Transfer the name, a new wallet gets the spending rules automatically.

---

## Live deployment (Sepolia)

| Contract | Address |
|---|---|
| PolicyGuard | `0x6912A1247952dd082839d93c79f6e64c5898F939` |
| ENS v2 Resolver | `0xdc58Fa0E2915579b0679ee9c6dDd328b47e90c99` |
| Demo agent ENS | `traderbot.eth` (ENS v2 namechain alpha) |

---

## Project structure

```
allowance.eth/
├── src/PolicyGuard.sol                      ← On-chain policy enforcement
├── script/DeployPolicyGuard.s.sol           ← Foundry deploy script
├── test/PolicyGuard.t.sol                   ← Forge tests
├── erc7730/PolicyGuard.json                 ← Ledger ERC-7730 clear signing descriptor
├── speculos/                                ← Ledger Speculos emulator bridge
├── setup-agent-write.ts                     ← Write ENS text record via viem
├── setup-agent-read.ts                      ← Read ENS text record via viem
├── setup-agent-readsubnames.ts              ← Read subname records
└── frontend/
    ├── app/
    │   ├── page.tsx                         ← Policy authoring + simulator (home)
    │   ├── transfer/page.tsx                ← Transfer Agent Identity
    │   ├── profile/page.tsx                 ← ENS profile viewer
    │   ├── agent/page.tsx                   ← Agent activity log
    │   └── api/
    │       ├── translate-policy/            ← Claude: natural language → JSON policy
    │       ├── submit-approval/             ← Relayer: submit human-approved tx
    │       ├── transfer-ownership/          ← Relayer: transfer PolicyGuard ownership
    │       └── grant-resolver-role/         ← Relayer: grant ENS v2 resolver roles
    ├── lib/
    │   ├── policySchema.ts                  ← Types, JSON schema, validator
    │   └── ensClient.ts                     ← viem ENS + PolicyGuard helpers
    └── components/
        ├── PolicyEditor.tsx                 ← Natural language + JSON policy editor
        ├── AgentSimulator.tsx               ← Simulate agent transactions on-chain
        ├── PublishPanel.tsx                 ← Publish policy to ENS + PolicyGuard
        ├── TransferIdentityPanel.tsx        ← Transfer agent identity to new wallet
        ├── PolicyCard.tsx                   ← Policy preview card
        ├── PolicyDiff.tsx                   ← On-chain vs local policy diff
        └── Navbar.tsx
```

---

## Policy schema (v1)

Stored as a JSON text record on ENS under the key `allowance.policy.v1`.

```jsonc
{
  "version": "1",
  "name": "Uniswap Trading Policy",
  "dailyCap": { "amount": 50, "token": "USDC" },
  "allowlist": [
    "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",  // Uniswap V3 Router
    "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",  // Uniswap Universal Router
    "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951"   // AAVE V3 Pool (Sepolia)
  ],
  "timeWindow": { "start": "09:00", "end": "17:00", "timezone": "UTC" },
  "approvalThreshold": { "amount": 30, "token": "USDC" },
  "perCounterpartyCap": { "amount": 20, "token": "USDC" },
  "expiresAt": "2026-12-31T23:59:59Z",
  "notes": "Human-readable description"
}
```

---

## Getting started

### 1. Deploy PolicyGuard

```bash
# Install Foundry: https://getfoundry.sh
forge install

cp .env.example .env
# Fill in: PRIVATE_KEY, SEPOLIA_RPC_URL, ETHERSCAN_API_KEY

forge script script/DeployPolicyGuard.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

Copy the deployed address into `frontend/.env.local` as `NEXT_PUBLIC_POLICY_GUARD_ADDRESS`.

### 2. Run smart contract tests

```bash
forge test -vvv
```

### 3. Start the frontend

```bash
cd frontend
npm install

cp .env.example .env.local
# Fill in:
#   ANTHROPIC_API_KEY               — for natural language policy authoring
#   NEXT_PUBLIC_POLICY_GUARD_ADDRESS
#   NEXT_PUBLIC_RPC_URL
#   NEXT_PUBLIC_DYNAMIC_ENV_ID      — from app.dynamic.xyz
#   PRIVATE_KEY                     — relayer key for server-side operations

npm run dev   # → http://localhost:3000
```

---

## Key features

### Policy authoring
Type spending rules in plain English — *"Max 0.1 ETH per day on AAVE, require human approval above 0.05 ETH"* — and Claude translates it to a validated JSON policy. Edit the JSON directly or use the natural language interface.

### On-chain simulation
Before any transaction, the agent calls `PolicyGuard.simulate()` to check against all gates (daily cap, allowlist, time window). The frontend simulator lets you test any target contract and amount interactively against the live published policy.

### Human approval via Ledger
When a transaction exceeds the approval threshold, it requires a human signature from a Ledger device. The Speculos emulator bridge (`speculos/`) enables this flow in development. Uses Ledger's ERC-7730 clear signing — the device shows a human-readable summary, not raw hex.

### Transfer Agent Identity
Moving to a new wallet takes three sequential MetaMask transactions:
1. Grant ENS v2 resolver manager roles to the new wallet
2. Update the ENS addr record to point to the new wallet
3. Transfer PolicyGuard ownership to the new wallet

The spending policy is untouched. Rules travel with the ENS name.

### Policy diff
Live diff between the policy currently published on-chain and any local edits — see exactly what changes before publishing.

---

## Ledger ERC-7730 clear signing

The descriptor at `erc7730/PolicyGuard.json` covers three contract functions. When a transaction hits the approval threshold, the Ledger shows:

```
AGENT REQUEST
Target: Uniswap Universal Router
ETH Value: 35.0 USDC

ACTIVE POLICY
Daily Cap: 50.0 USDC
Approval Threshold: 30.0 USDC
[Approve] [Reject]
```

To validate the descriptor:

```bash
pip install ledger-erc7730
erc7730 lint erc7730/PolicyGuard.json
```

---

## Stack

| Layer | Tech |
|---|---|
| Smart contracts | Solidity + Foundry |
| On-chain reads/writes | viem |
| Wallet connection | Dynamic |
| AI policy authoring | Anthropic Claude (claude-sonnet-4-6) |
| ENS | ENS v2 namechain (Sepolia alpha) |
| Ledger signing | ERC-7730 + Speculos emulator |
| Frontend | Next.js 14, Tailwind CSS |
| Network | Sepolia testnet |

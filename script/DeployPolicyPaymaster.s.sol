// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PolicyGuard}     from "../src/PolicyGuard.sol";
import {PolicyPaymaster} from "../src/PolicyPaymaster.sol";

/**
 * @title DeployPolicyPaymaster
 * @notice Deploy the ERC-4337 PolicyPaymaster and wire it to an existing PolicyGuard.
 *
 * Prerequisites:
 *   - PolicyGuard already deployed (set POLICY_GUARD_ADDRESS env var)
 *   - Funded deployer key (PRIVATE_KEY env var)
 *   - ENS namehash of the agent (AGENT_NAMEHASH env var, 0x-prefixed)
 *
 * Usage:
 *   forge script script/DeployPolicyPaymaster.s.sol \
 *     --rpc-url $SEPOLIA_RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $ETHERSCAN_API_KEY
 *
 * After deployment:
 *   1. Fund the paymaster: cast send <PAYMASTER_ADDR> "deposit()" --value 0.05ether ...
 *   2. Stake the paymaster: cast send <PAYMASTER_ADDR> "addStake(uint32)" 86400 --value 0.01ether ...
 */
contract DeployPolicyPaymaster is Script {
    // ERC-4337 EntryPoint v0.7 — same address on all chains
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function run() external returns (PolicyPaymaster paymaster) {
        address guardAddr   = vm.envAddress("POLICY_GUARD_ADDRESS");
        bytes32 agentNode   = vm.envBytes32("AGENT_NAMEHASH");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("Deploying PolicyPaymaster from:", deployer);
        console.log("Chain ID:    ", block.chainid);
        console.log("PolicyGuard: ", guardAddr);
        console.log("Agent node:  ");
        console.logBytes32(agentNode);

        vm.startBroadcast(deployerKey);

        paymaster = new PolicyPaymaster(ENTRY_POINT, guardAddr);
        console.log("PolicyPaymaster deployed at:", address(paymaster));

        // Wire paymaster to PolicyGuard
        PolicyGuard(guardAddr).setAuthorizedPaymaster(agentNode, address(paymaster));
        console.log("setAuthorizedPaymaster() called - paymaster is now authorized");

        vm.stopBroadcast();

        console.log("");
        console.log("Next steps:");
        console.log("  1. Fund gas deposit:");
        console.log("     cast send", address(paymaster), '"deposit()" --value 0.05ether --private-key $PRIVATE_KEY --rpc-url $SEPOLIA_RPC_URL');
        console.log("  2. Add stake (required for paymasters):");
        console.log("     cast send", address(paymaster), '"addStake(uint32)" 86400 --value 0.01ether --private-key $PRIVATE_KEY --rpc-url $SEPOLIA_RPC_URL');
        console.log("  3. Set NEXT_PUBLIC_POLICY_PAYMASTER_ADDRESS=", address(paymaster), "in frontend/.env.local");
    }
}

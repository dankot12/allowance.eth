// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PolicyGuard} from "../src/PolicyGuard.sol";

/**
 * @title DeployPolicyGuard
 * @notice Deploy PolicyGuard to Sepolia (or any EVM chain).
 *
 * Usage:
 *   forge script script/DeployPolicyGuard.s.sol \
 *     --rpc-url $SEPOLIA_RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $ETHERSCAN_API_KEY
 *
 * After deployment:
 *   1. Copy the deployed address into frontend/.env.local as NEXT_PUBLIC_POLICY_GUARD_ADDRESS
 *   2. Run `npm run dev` in the frontend/ directory
 */
contract DeployPolicyGuard is Script {
    function run() external returns (PolicyGuard guard) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deploying PolicyGuard from:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);
        guard = new PolicyGuard();
        vm.stopBroadcast();

        console.log("PolicyGuard deployed at:", address(guard));
        console.log("");
        console.log("Next steps:");
        console.log("  1. Add to frontend/.env.local:");
        console.log("     NEXT_PUBLIC_POLICY_GUARD_ADDRESS=", address(guard));
        console.log("  2. Verify on Etherscan:");
        console.log("     forge verify-contract", address(guard), "src/PolicyGuard.sol:PolicyGuard --chain sepolia");
    }
}

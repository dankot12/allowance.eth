// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {PolicyGuard} from "../src/PolicyGuard.sol";

contract PolicyGuardTest is Test {
    PolicyGuard public guard;
    address public owner = address(0xBEEF);
    address public uniswap = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    bytes32 public testNode = keccak256("testnode");

    // A minimal policy JSON for testing
    string constant POLICY_JSON = '{"version":"1","name":"Test Policy","dailyCap":{"amount":50,"token":"USDC"}}';

    function setUp() public {
        guard = new PolicyGuard();
        // Register policy as owner
        vm.prank(owner);
        guard.updatePolicy(testNode, keccak256(bytes(POLICY_JSON)));
    }

    function test_UpdatePolicy() public {
        bytes32 stored = guard.getPolicyHash(testNode);
        assertEq(stored, keccak256(bytes(POLICY_JSON)));
    }

    function test_UnauthorizedUpdate() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(PolicyGuard.Unauthorized.selector);
        guard.updatePolicy(testNode, keccak256("other policy"));
    }

    function test_CheckApproved() public {
        PolicyGuard.ParsedPolicy memory policy = _buildPolicy(50 ether, false, false);
        bool result = guard.check(testNode, uniswap, 25 ether, "", policy, POLICY_JSON);
        assertTrue(result);
    }

    function test_CheckExceedsDailyCap() public {
        PolicyGuard.ParsedPolicy memory policy = _buildPolicy(50 ether, false, false);
        // First tx: 30 ETH
        guard.check(testNode, uniswap, 30 ether, "", policy, POLICY_JSON);
        // Second tx: 25 ETH — total 55, exceeds 50
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.ExceedsDailyCap.selector, 55 ether, 50 ether));
        guard.check(testNode, uniswap, 25 ether, "", policy, POLICY_JSON);
    }

    function test_CheckPolicyNotSet() public {
        bytes32 unknownNode = keccak256("unknown");
        PolicyGuard.ParsedPolicy memory policy = _buildPolicy(50 ether, false, false);
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.PolicyNotSet.selector, unknownNode));
        guard.check(unknownNode, uniswap, 10 ether, "", policy, POLICY_JSON);
    }

    function test_CheckPolicyHashMismatch() public {
        PolicyGuard.ParsedPolicy memory policy = _buildPolicy(50 ether, false, false);
        string memory wrongJson = '{"version":"1","name":"Wrong"}';
        vm.expectRevert();
        guard.check(testNode, uniswap, 10 ether, "", policy, wrongJson);
    }

    function test_CheckAllowlist() public {
        address[] memory allowlist = new address[](1);
        allowlist[0] = uniswap;

        PolicyGuard.ParsedPolicy memory policy = PolicyGuard.ParsedPolicy({
            dailyCap: PolicyGuard.Cap({amount: 50 ether, enabled: true}),
            approvalThreshold: PolicyGuard.Cap({amount: 0, enabled: false}),
            perCounterpartyCap: PolicyGuard.Cap({amount: 0, enabled: false}),
            timeWindow: PolicyGuard.TimeWindow({start: 0, end: 0, enabled: false}),
            allowlist: allowlist,
            allowlistEnabled: true
        });

        // Uniswap is allowed
        bool result = guard.check(testNode, uniswap, 10 ether, "", policy, POLICY_JSON);
        assertTrue(result);

        // Unknown address is blocked
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.TargetNotAllowlisted.selector, address(0xBAD)));
        guard.check(testNode, address(0xBAD), 10 ether, "", policy, POLICY_JSON);
    }

    function test_CheckApprovalThreshold() public {
        PolicyGuard.ParsedPolicy memory policy = PolicyGuard.ParsedPolicy({
            dailyCap: PolicyGuard.Cap({amount: 100 ether, enabled: true}),
            approvalThreshold: PolicyGuard.Cap({amount: 30 ether, enabled: true}),
            perCounterpartyCap: PolicyGuard.Cap({amount: 0, enabled: false}),
            timeWindow: PolicyGuard.TimeWindow({start: 0, end: 0, enabled: false}),
            allowlist: new address[](0),
            allowlistEnabled: false
        });

        // Below threshold: ok
        bool ok = guard.check(testNode, uniswap, 25 ether, "", policy, POLICY_JSON);
        assertTrue(ok);

        // At/above threshold: reverts
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.ExceedsApprovalThreshold.selector, 30 ether, 30 ether));
        guard.check(testNode, uniswap, 30 ether, "", policy, POLICY_JSON);
    }

    function test_SimulateDoesNotMutateState() public {
        PolicyGuard.ParsedPolicy memory policy = _buildPolicy(50 ether, false, false);
        // Simulate a big spend
        (bool allowed,) = guard.simulate(testNode, uniswap, 49 ether, "", policy, POLICY_JSON);
        assertTrue(allowed);
        // State should be unchanged — real check still has full 50 available
        bool result = guard.check(testNode, uniswap, 49 ether, "", policy, POLICY_JSON);
        assertTrue(result);
    }

    // ── Helpers ──────────────────────────────────────────────

    function _buildPolicy(
        uint256 dailyCapAmount,
        bool enableTimeWindow,
        bool enablePerCounterparty
    ) internal pure returns (PolicyGuard.ParsedPolicy memory) {
        return PolicyGuard.ParsedPolicy({
            dailyCap: PolicyGuard.Cap({amount: dailyCapAmount, enabled: true}),
            approvalThreshold: PolicyGuard.Cap({amount: 0, enabled: false}),
            perCounterpartyCap: PolicyGuard.Cap({amount: 0, enabled: enablePerCounterparty}),
            timeWindow: PolicyGuard.TimeWindow({start: 0, end: 0, enabled: enableTimeWindow}),
            allowlist: new address[](0),
            allowlistEnabled: false
        });
    }
}

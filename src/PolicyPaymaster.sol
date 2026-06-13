// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PolicyGuard} from "./PolicyGuard.sol";

// ── ERC-4337 v0.7 types (inline — no external dependency) ────────────────────

struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes   initCode;
    bytes   callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes   paymasterAndData;
    bytes   signature;
}

enum PostOpMode {
    opSucceeded,
    opReverted,
    postOpReverted
}

interface IEntryPoint {
    function depositTo(address account) external payable;
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
    function addStake(uint32 unstakeDelaySec) external payable;
    function unlockStake() external;
    function withdrawStake(address payable withdrawAddress) external;
    function getDepositInfo(address account)
        external view
        returns (uint112 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime);
}

// ── PolicyPaymaster ───────────────────────────────────────────────────────────

/**
 * @title PolicyPaymaster
 * @notice ERC-4337 paymaster that enforces ENS spending policies.
 *
 * Flow:
 *   1. validatePaymasterUserOp — called by the EntryPoint during validation phase (no state change).
 *      Decodes policy data from paymasterAndData and calls PolicyGuard.simulate().
 *      Returns SIG_VALIDATION_FAILED (1) if the policy blocks the transaction.
 *
 *   2. postOp — called after the userOp executes successfully.
 *      Calls PolicyGuard.recordSpend() to commit the spend accumulators.
 *      The paymaster must be registered via PolicyGuard.setAuthorizedPaymaster() first.
 *
 * paymasterAndData layout (bytes after the 20-byte paymaster address):
 *   abi.encode(bytes32 namehash_, address target, uint256 value, ParsedPolicy policy, string policyJson)
 *
 * Setup (once per agent namehash):
 *   1. Deploy this contract.
 *   2. call deposit() to fund gas on the EntryPoint.
 *   3. call addStake() (required for paymasters — 1 day delay, minimal ETH).
 *   4. Policy owner calls PolicyGuard.setAuthorizedPaymaster(namehash_, address(this)).
 *
 * EntryPoint v0.7 on Sepolia: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
 */
contract PolicyPaymaster {
    IEntryPoint public immutable entryPoint;
    PolicyGuard public immutable guard;
    address      public          owner;

    uint256 private constant SIG_VALIDATION_SUCCESS = 0;
    uint256 private constant SIG_VALIDATION_FAILED  = 1;

    error OnlyEntryPoint();
    error OnlyOwner();

    event PolicyCheckPassed(bytes32 indexed namehash, address target, uint256 value);
    event PolicyCheckFailed(bytes32 indexed namehash, address target, uint256 value, string reason);

    modifier onlyEntryPoint() {
        if (msg.sender != address(entryPoint)) revert OnlyEntryPoint();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _entryPoint, address _guard) {
        entryPoint = IEntryPoint(_entryPoint);
        guard      = PolicyGuard(_guard);
        owner      = msg.sender;
    }

    // ── Deposit & stake management ────────────────────────────────────────────

    receive() external payable {}

    /// @notice Fund gas on the EntryPoint. The paymaster must maintain a deposit for userOps.
    function deposit() external payable {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    /// @notice Stake on the EntryPoint (required for paymasters with global storage access).
    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }

    function withdrawTo(address payable to, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ── ERC-4337 IPaymaster ───────────────────────────────────────────────────

    /**
     * @notice Validate that the userOp is allowed under the agent's ENS policy.
     *         Called by the EntryPoint during validation — MUST NOT change state (ERC-4337 rule).
     *
     * Decodes (namehash_, target, value, policy, policyJson) from paymasterAndData[20:],
     * then delegates to PolicyGuard.simulate() which is a view function.
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        bytes calldata pmData = userOp.paymasterAndData[20:];
        (
            bytes32                  namehash_,
            address                  target,
            uint256                  value,
            PolicyGuard.ParsedPolicy memory policy,
            string                   memory policyJson
        ) = abi.decode(pmData, (bytes32, address, uint256, PolicyGuard.ParsedPolicy, string));

        (bool allowed, string memory reason) = guard.simulate(
            namehash_, target, value, userOp.callData, policy, policyJson
        );

        if (!allowed) {
            emit PolicyCheckFailed(namehash_, target, value, reason);
            return (bytes(""), SIG_VALIDATION_FAILED);
        }

        emit PolicyCheckPassed(namehash_, target, value);
        context        = abi.encode(namehash_, target, value);
        validationData = SIG_VALIDATION_SUCCESS;
    }

    /**
     * @notice Commit the spend accumulators after a successful userOp.
     *         Calls PolicyGuard.recordSpend() — this is the only state-changing call
     *         and it happens AFTER execution (safe from ERC-4337 validation constraints).
     */
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external onlyEntryPoint {
        if (mode != PostOpMode.opSucceeded) return;
        (bytes32 namehash_, address target, uint256 value) = abi.decode(
            context, (bytes32, address, uint256)
        );
        guard.recordSpend(namehash_, target, value);
    }
}

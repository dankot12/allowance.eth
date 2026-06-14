// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PolicyGuard
 * @notice On-chain enforcement of ENS-stored spending policies for AI agent wallets.
 *
 * Architecture:
 *  - The user publishes a JSON policy to their agent's ENS name (text record key: "allowance.policy.v1").
 *  - When publishing, the policy's keccak256 hash is also stored here via `updatePolicy()`.
 *  - Every agent transaction calls `check()` passing the full JSON policy.
 *    The guard verifies the JSON hashes to the stored value, then evaluates the rules.
 *
 * Approval threshold flow (Ledger integration):
 *  - If a transaction exceeds the approval threshold, `check()` reverts with ExceedsApprovalThreshold.
 *  - The agent UI surfaces this to the human (policy owner) who signs an approval message on their Ledger.
 *  - The agent then calls `checkWithHumanApproval()` with the Ledger signature — which bypasses the
 *    threshold gate but still enforces all other rules (daily cap, allowlist, time window).
 *
 * ERC-4337 paymaster flow:
 *  - The PolicyPaymaster calls `simulate()` during validatePaymasterUserOp (no state change).
 *  - After a successful userOp, the paymaster calls `recordSpend()` in postOp to update accumulators.
 *  - This avoids state mutation during EIP-3074 / ERC-4337 validation phases.
 *
 * Policy fields evaluated on-chain (all optional — omit to allow):
 *  - dailyCap:           { amount (18-decimal), token }
 *  - allowlist:          array of target addresses (if non-empty, only these are allowed)
 *  - timeWindowStart:    seconds-since-midnight UTC (0–86399)
 *  - timeWindowEnd:      seconds-since-midnight UTC (0–86399)
 *  - approvalThreshold:  { amount (18-decimal), token } — reverts with NEEDS_APPROVAL above this
 *  - perCounterpartyCap: { amount (18-decimal), token }
 */
contract PolicyGuard {
    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    error PolicyNotSet(bytes32 namehash);
    error PolicyHashMismatch(bytes32 expected, bytes32 got);
    error ExceedsDailyCap(uint256 amount, uint256 cap);
    error TargetNotAllowlisted(address target);
    error OutsideTimeWindow(uint256 currentTime, uint256 start, uint256 end);
    error ExceedsApprovalThreshold(uint256 amount, uint256 threshold);
    error ExceedsPerCounterpartyCap(address target, uint256 amount, uint256 cap);
    error InvalidPolicy(string reason);
    error InvalidSignature();
    error Unauthorized();

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    event PolicyUpdated(bytes32 indexed namehash, bytes32 policyHash, address updatedBy);
    event PaymasterUpdated(bytes32 indexed namehash, address paymaster);
    event HumanApproverSet(bytes32 indexed namehash, address approver);
    event TransactionApproved(bytes32 indexed namehash, address target, uint256 value);
    event TransactionApprovedByHuman(bytes32 indexed namehash, address target, uint256 value, address approver);
    event TransactionBlocked(bytes32 indexed namehash, address target, uint256 value, string reason);

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @notice namehash → keccak256(policyJSON)
    mapping(bytes32 => bytes32) public policyHashes;

    /// @notice namehash → (day → cumulative spend in wei-equivalent)
    mapping(bytes32 => mapping(uint256 => uint256)) public dailySpend;

    /// @notice namehash → (target → (day → cumulative spend))
    mapping(bytes32 => mapping(address => mapping(uint256 => uint256))) public counterpartySpend;

    /// @notice namehash → authorized updater (owner of the ENS name, set at registration)
    mapping(bytes32 => address) public policyOwners;

    /// @notice namehash → address authorized to sign human approvals (e.g. Ledger/Speculos device).
    ///         Defaults to policyOwner if not set. Separated so the signer never needs gas.
    mapping(bytes32 => address) public humanApprovers;

    /// @notice namehash → authorized ERC-4337 paymaster (can call recordSpend in postOp)
    mapping(bytes32 => address) public authorizedPaymasters;

    // ──────────────────────────────────────────────
    // Structs (passed by caller, not stored)
    // ──────────────────────────────────────────────

    struct Cap {
        uint256 amount;   // 18-decimal normalized
        bool    enabled;
    }

    struct TimeWindow {
        uint32 start;  // seconds since midnight UTC
        uint32 end;    // seconds since midnight UTC
        bool   enabled;
    }

    struct ParsedPolicy {
        Cap          dailyCap;
        Cap          approvalThreshold;
        Cap          perCounterpartyCap;
        TimeWindow   timeWindow;
        address[]    allowlist;      // empty = allow all
        bool         allowlistEnabled;
    }

    // ──────────────────────────────────────────────
    // Policy registration
    // ──────────────────────────────────────────────

    /**
     * @notice Register or update a policy hash for an agent's ENS namehash.
     * @param namehash_  keccak namehash of the agent's ENS name (e.g. namehash("myagent.eth"))
     * @param policyHash keccak256 of the full policy JSON string
     *
     * On first call, the caller becomes the policy owner.
     * Subsequent updates require the same owner.
     */
    function updatePolicy(bytes32 namehash_, bytes32 policyHash) external {
        address owner = policyOwners[namehash_];
        if (owner == address(0)) {
            policyOwners[namehash_] = msg.sender;
        } else if (owner != msg.sender) {
            revert Unauthorized();
        }

        policyHashes[namehash_] = policyHash;
        emit PolicyUpdated(namehash_, policyHash, msg.sender);
    }

    /**
     * @notice Transfer policy ownership (e.g. after ENS name transfer).
     */
    function transferPolicyOwnership(bytes32 namehash_, address newOwner) external {
        if (policyOwners[namehash_] != msg.sender) revert Unauthorized();
        policyOwners[namehash_] = newOwner;
    }

    /**
     * @notice Set a dedicated human approver address for Ledger/Speculos signing.
     *         Decoupled from policyOwner so the signing device never needs gas.
     *         Set to address(0) to fall back to policyOwner for approvals.
     */
    function setHumanApprover(bytes32 namehash_, address approver) external {
        if (policyOwners[namehash_] != msg.sender) revert Unauthorized();
        humanApprovers[namehash_] = approver;
        emit HumanApproverSet(namehash_, approver);
    }

    /**
     * @notice Authorize an ERC-4337 paymaster to call recordSpend() for this agent.
     *         Only the policy owner can set this. Set to address(0) to disable.
     */
    function setAuthorizedPaymaster(bytes32 namehash_, address paymaster) external {
        if (policyOwners[namehash_] != msg.sender) revert Unauthorized();
        authorizedPaymasters[namehash_] = paymaster;
        emit PaymasterUpdated(namehash_, paymaster);
    }

    // ──────────────────────────────────────────────
    // Core enforcement
    // ──────────────────────────────────────────────

    /**
     * @notice Check whether a proposed transaction is allowed under the agent's policy.
     *
     * @param namehash_   ENS namehash of the agent
     * @param target      Destination contract/address of the transaction
     * @param value       ETH value in wei
     * @param data        Calldata (reserved for future selector-based rules)
     * @param policy      The parsed policy struct (caller constructs off-chain from JSON)
     * @param policyJson  Raw policy JSON string — must hash to the stored policy hash
     *
     * Reverts with a specific error if any rule is violated.
     * Returns true if all rules pass.
     * Updates daily and per-counterparty spend accumulators on success.
     */
    function check(
        bytes32        namehash_,
        address        target,
        uint256        value,
        bytes calldata data,
        ParsedPolicy calldata policy,
        string calldata policyJson
    ) external returns (bool) {
        _verifyPolicyHash(namehash_, policyJson);
        _checkAllowlist(namehash_, target, value, policy);
        _checkTimeWindow(namehash_, target, value, policy);

        // Approval threshold check — reverts for human routing
        if (policy.approvalThreshold.enabled && value >= policy.approvalThreshold.amount) {
            emit TransactionBlocked(namehash_, target, value, "ExceedsApprovalThreshold");
            revert ExceedsApprovalThreshold(value, policy.approvalThreshold.amount);
        }

        _checkAndRecordSpend(namehash_, target, value, policy);

        emit TransactionApproved(namehash_, target, value);
        return true;
    }

    /**
     * @notice Check a transaction that exceeds the approval threshold, verified by a human signature.
     *
     * When `check()` reverts with ExceedsApprovalThreshold, the agent surfaces this to the human
     * (policy owner). The human signs an approval message on their Ledger device — the ERC-7730
     * descriptor in eip7730/PolicyGuard.json renders this as human-readable clear signing.
     * The resulting signature is passed here to bypass the threshold gate.
     *
     * The signature covers: keccak256(abi.encode(namehash_, target, value, keccak256(policyJson), day))
     * Day-scoped: signature expires at UTC midnight and cannot be replayed.
     *
     * @param humanSig  65-byte ECDSA signature from the policy owner (Ledger device holder)
     */
    function checkWithHumanApproval(
        bytes32        namehash_,
        address        target,
        uint256        value,
        bytes calldata data,
        ParsedPolicy calldata policy,
        string calldata policyJson,
        bytes calldata humanSig
    ) external returns (bool) {
        // Verify Ledger signature is from the humanApprover (if set) or the policy owner
        bytes32 digest = _approvalDigest(namehash_, target, value, policyJson);
        address signer = _recoverSigner(digest, humanSig);
        address approver = humanApprovers[namehash_];
        address expected = approver != address(0) ? approver : policyOwners[namehash_];
        if (signer != expected) revert InvalidSignature();

        // Run all checks except approvalThreshold — that's what human approval bypasses
        _verifyPolicyHash(namehash_, policyJson);
        _checkAllowlist(namehash_, target, value, policy);
        _checkTimeWindow(namehash_, target, value, policy);
        _checkAndRecordSpend(namehash_, target, value, policy);

        emit TransactionApprovedByHuman(namehash_, target, value, signer);
        return true;
    }

    /**
     * @notice Record spend without running policy checks. Only callable by the authorized paymaster.
     *         Used by the ERC-4337 PolicyPaymaster in postOp after a successful userOp.
     *         The paymaster validated via simulate() during validatePaymasterUserOp — this just
     *         commits the accumulators after confirmed execution.
     */
    function recordSpend(bytes32 namehash_, address target, uint256 value) external {
        if (msg.sender != authorizedPaymasters[namehash_]) revert Unauthorized();
        uint256 today = block.timestamp / 86400;
        dailySpend[namehash_][today] += value;
        counterpartySpend[namehash_][target][today] += value;
        emit TransactionApproved(namehash_, target, value);
    }

    /**
     * @notice Read-only version of check() for simulation/preview. Does NOT update state.
     *         Returns (allowed, reason) — never reverts.
     */
    function simulate(
        bytes32        namehash_,
        address        target,
        uint256        value,
        bytes calldata data,
        ParsedPolicy calldata policy,
        string calldata policyJson
    ) external view returns (bool allowed, string memory reason) {
        bytes32 stored = policyHashes[namehash_];
        if (stored == bytes32(0)) return (false, "PolicyNotSet");

        bytes32 got = keccak256(bytes(policyJson));
        if (got != stored) return (false, "PolicyHashMismatch");

        if (policy.allowlistEnabled && policy.allowlist.length > 0) {
            bool found = false;
            for (uint256 i = 0; i < policy.allowlist.length; i++) {
                if (policy.allowlist[i] == target) { found = true; break; }
            }
            if (!found) return (false, "TargetNotAllowlisted");
        }

        if (policy.timeWindow.enabled) {
            uint256 secondsInDay = block.timestamp % 86400;
            uint32 s = policy.timeWindow.start;
            uint32 e = policy.timeWindow.end;
            bool inWindow = (s <= e)
                ? (secondsInDay >= s && secondsInDay <= e)
                : (secondsInDay >= s || secondsInDay <= e);
            if (!inWindow) return (false, "OutsideTimeWindow");
        }

        if (policy.approvalThreshold.enabled && value >= policy.approvalThreshold.amount) {
            return (false, "ExceedsApprovalThreshold - NeedsHumanApproval");
        }

        uint256 today = block.timestamp / 86400;
        if (policy.perCounterpartyCap.enabled) {
            uint256 projected = counterpartySpend[namehash_][target][today] + value;
            if (projected > policy.perCounterpartyCap.amount) return (false, "ExceedsPerCounterpartyCap");
        }

        if (policy.dailyCap.enabled) {
            uint256 projected = dailySpend[namehash_][today] + value;
            if (projected > policy.dailyCap.amount) return (false, "ExceedsDailyCap");
        }

        return (true, "");
    }

    // ──────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────

    function getPolicyHash(bytes32 namehash_) external view returns (bytes32) {
        return policyHashes[namehash_];
    }

    function getDailySpend(bytes32 namehash_, uint256 day) external view returns (uint256) {
        return dailySpend[namehash_][day];
    }

    function getTodaySpend(bytes32 namehash_) external view returns (uint256) {
        return dailySpend[namehash_][block.timestamp / 86400];
    }

    /**
     * @notice Compute the approval digest that the human (policy owner) must sign.
     *         Useful for frontends to construct the message before calling signMessage().
     */
    function getApprovalDigest(
        bytes32 namehash_,
        address target,
        uint256 value,
        string calldata policyJson
    ) external view returns (bytes32) {
        return _approvalDigest(namehash_, target, value, policyJson);
    }

    // ──────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────

    function _verifyPolicyHash(bytes32 namehash_, string calldata policyJson) internal view {
        bytes32 stored = policyHashes[namehash_];
        if (stored == bytes32(0)) revert PolicyNotSet(namehash_);
        bytes32 got = keccak256(bytes(policyJson));
        if (got != stored) revert PolicyHashMismatch(stored, got);
    }

    function _checkAllowlist(
        bytes32 namehash_,
        address target,
        uint256 value,
        ParsedPolicy calldata policy
    ) internal {
        if (policy.allowlistEnabled && policy.allowlist.length > 0) {
            bool found = false;
            for (uint256 i = 0; i < policy.allowlist.length; i++) {
                if (policy.allowlist[i] == target) { found = true; break; }
            }
            if (!found) {
                emit TransactionBlocked(namehash_, target, value, "TargetNotAllowlisted");
                revert TargetNotAllowlisted(target);
            }
        }
    }

    function _checkTimeWindow(
        bytes32 namehash_,
        address target,
        uint256 value,
        ParsedPolicy calldata policy
    ) internal {
        if (policy.timeWindow.enabled) {
            uint256 secondsInDay = block.timestamp % 86400;
            uint32 s = policy.timeWindow.start;
            uint32 e = policy.timeWindow.end;
            bool inWindow = (s <= e)
                ? (secondsInDay >= s && secondsInDay <= e)
                : (secondsInDay >= s || secondsInDay <= e);
            if (!inWindow) {
                emit TransactionBlocked(namehash_, target, value, "OutsideTimeWindow");
                revert OutsideTimeWindow(secondsInDay, s, e);
            }
        }
    }

    function _checkAndRecordSpend(
        bytes32 namehash_,
        address target,
        uint256 value,
        ParsedPolicy calldata policy
    ) internal {
        uint256 today = block.timestamp / 86400;

        if (policy.perCounterpartyCap.enabled) {
            uint256 newCounterpartySpend = counterpartySpend[namehash_][target][today] + value;
            if (newCounterpartySpend > policy.perCounterpartyCap.amount) {
                emit TransactionBlocked(namehash_, target, value, "ExceedsPerCounterpartyCap");
                revert ExceedsPerCounterpartyCap(target, newCounterpartySpend, policy.perCounterpartyCap.amount);
            }
        }

        if (policy.dailyCap.enabled) {
            uint256 newDailySpend = dailySpend[namehash_][today] + value;
            if (newDailySpend > policy.dailyCap.amount) {
                emit TransactionBlocked(namehash_, target, value, "ExceedsDailyCap");
                revert ExceedsDailyCap(newDailySpend, policy.dailyCap.amount);
            }
            dailySpend[namehash_][today] = newDailySpend;
        }

        if (policy.perCounterpartyCap.enabled) {
            counterpartySpend[namehash_][target][today] += value;
        }
    }

    /**
     * @dev Builds the personal_sign approval digest.
     *      Matches viem's signMessage({ message: { raw: structHash } }) output.
     *      Day-scoped so signatures expire at UTC midnight.
     */
    function _approvalDigest(
        bytes32 namehash_,
        address target,
        uint256 value,
        string calldata policyJson
    ) internal view returns (bytes32) {
        bytes32 policyHash = keccak256(bytes(policyJson));
        uint256 day = block.timestamp / 86400;
        bytes32 structHash = keccak256(abi.encode(namehash_, target, value, policyHash, day));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
    }

    function _recoverSigner(bytes32 messageHash, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        address signer = ecrecover(messageHash, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }
}

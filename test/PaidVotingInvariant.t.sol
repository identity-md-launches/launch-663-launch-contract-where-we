// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PaidVoting} from "src/PaidVoting.sol";

/// @dev A test-only donor: creation and destruction occur in the same transaction.
contract ForcedVotingDonation {
    constructor(address payable recipient) payable {
        selfdestruct(recipient);
    }
}

contract PaidVotingHandler is Test {
    struct Model {
        address[8] actors;
        uint256[8] paid;
        uint256[8] reachedAt;
        uint256 votes;
        uint256 forcedETH;
    }

    PaidVoting private immutable voting;
    Model private ghost;

    constructor(PaidVoting target) {
        voting = target;
        for (uint256 i; i < ghost.actors.length; ++i) {
            ghost.actors[i] = address(uint160(0x10000 + i));
        }
    }

    function model() external view returns (Model memory) {
        return ghost;
    }

    // Small payments make ties and repeated displacement common.
    function paySmall(uint256 actorSeed, uint256 amountSeed) external {
        _pay(_actorIndex(actorSeed), bound(amountSeed, 1, 32));
    }

    // uint128 leaves headroom for repeated votes and donations over the campaign.
    function payLarge(uint256 actorSeed, uint256 amountSeed) external {
        _pay(_actorIndex(actorSeed), bound(amountSeed, 1, type(uint128).max));
    }

    /// @dev Derive payments from the independent ledger to hit equality and +1 edges.
    function chaseScore(uint256 actorSeed, uint256 competitorSeed, bool overtake) external {
        uint256 actorIndex = _actorIndex(actorSeed);
        uint256 target = ghost.paid[_actorIndex(competitorSeed)];
        uint256 current = ghost.paid[actorIndex];
        uint256 amount = target > current ? target - current : 1;
        if (overtake) ++amount;
        _pay(actorIndex, amount);
    }

    function rejectZeroVote(uint256 actorSeed) external {
        address payer = ghost.actors[_actorIndex(actorSeed)];
        uint256 payerBalance = payer.balance;
        bytes32 beforeState = _stateDigest();

        vm.prank(payer);
        (bool success, bytes memory reason) = address(voting).call(abi.encodeCall(PaidVoting.vote, ()));

        assertFalse(success, "zero-value vote succeeded");
        assertEq(reason, abi.encodeWithSelector(PaidVoting.ZeroPayment.selector), "wrong zero-vote error");
        assertEq(payer.balance, payerBalance, "rejected vote spent ETH");
        assertEq(_stateDigest(), beforeState, "rejected vote changed state");
    }

    function rejectPayment(uint256 actorSeed, uint256 callSeed, uint256 amountSeed) external {
        address payer = ghost.actors[_actorIndex(actorSeed)];
        uint256 amount = bound(amountSeed, 1, type(uint128).max);
        uint256 kind = bound(callSeed, 0, 3);
        bytes memory payload;
        if (kind == 0) payload = "";
        else if (kind == 1) payload = hex"deadbeef";
        else if (kind == 2) payload = abi.encodeCall(PaidVoting.getTopPayers, ());
        else payload = abi.encodePacked(bytes3(PaidVoting.vote.selector));

        vm.deal(payer, amount);
        bytes32 beforeState = _stateDigest();
        vm.prank(payer);
        (bool success,) = address(voting).call{value: amount}(payload);

        assertFalse(success, "invalid payment succeeded");
        assertEq(payer.balance, amount, "rejected payment spent ETH");
        assertEq(_stateDigest(), beforeState, "rejected payment changed state");
    }

    function forceETH(uint256 amountSeed) external {
        uint256 amount = bound(amountSeed, 1, type(uint128).max);
        vm.deal(address(this), amount);
        new ForcedVotingDonation{value: amount}(payable(address(voting)));
        ghost.forcedETH += amount;
    }

    function _pay(uint256 actorIndex, uint256 amount) private {
        address payer = ghost.actors[actorIndex];
        (, uint256[3] memory previousAmounts) = voting.getTopPayers();
        uint256 previousBalance = address(voting).balance;

        vm.deal(payer, amount);
        vm.prank(payer);
        voting.vote{value: amount}();

        // These expectations come from inputs, never from the contract's accounting.
        ghost.paid[actorIndex] += amount;
        ++ghost.votes;
        ghost.reachedAt[actorIndex] = ghost.votes;

        assertEq(payer.balance, 0, "payer was not charged exactly once");
        assertEq(address(voting).balance, previousBalance + amount, "payment escaped custody");
        (, uint256[3] memory currentAmounts) = voting.getTopPayers();
        for (uint256 i; i < 3; ++i) {
            assertGe(currentAmounts[i], previousAmounts[i], "a rank's qualifying score decreased");
        }
    }

    function _actorIndex(uint256 seed) private pure returns (uint256) {
        return bound(seed, 0, 7);
    }

    function _stateDigest() private view returns (bytes32) {
        uint256[8] memory paid;
        address[3] memory indexedPayers;
        for (uint256 i; i < ghost.actors.length; ++i) {
            paid[i] = voting.totalPaid(ghost.actors[i]);
        }
        for (uint256 i; i < 3; ++i) {
            indexedPayers[i] = voting.topPayers(i);
        }
        (address[3] memory payers, uint256[3] memory amounts) = voting.getTopPayers();
        return keccak256(
            abi.encode(
                paid,
                indexedPayers,
                payers,
                amounts,
                voting.totalReceived(),
                voting.totalVotes(),
                address(voting).balance
            )
        );
    }
}

/// @dev Only the six handler actions are fuzz targets. Unexpected reverts must fail,
///      while deliberate invalid calls are caught and checked inside the handler.
/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 128
/// forge-config: default.invariant.fail-on-revert = true
contract PaidVotingInvariantTest is Test {
    PaidVoting private voting;
    PaidVotingHandler private handler;

    function setUp() public {
        voting = new PaidVoting();
        handler = new PaidVotingHandler(voting);

        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = PaidVotingHandler.paySmall.selector;
        selectors[1] = PaidVotingHandler.payLarge.selector;
        selectors[2] = PaidVotingHandler.chaseScore.selector;
        selectors[3] = PaidVotingHandler.rejectZeroVote.selector;
        selectors[4] = PaidVotingHandler.rejectPayment.selector;
        selectors[5] = PaidVotingHandler.forceETH.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_AccountingAndCustodyMatchAllSuccessfulPayments() public view {
        PaidVotingHandler.Model memory expected = handler.model();
        uint256 sum;
        for (uint256 i; i < expected.actors.length; ++i) {
            assertEq(voting.totalPaid(expected.actors[i]), expected.paid[i], "payer differs from payment ledger");
            sum += expected.paid[i];
        }
        assertEq(voting.totalReceived(), sum, "received ETH differs from all payers' contributions");
        assertEq(voting.totalVotes(), expected.votes, "vote count differs from successful calls");
        assertEq(address(voting).balance, sum + expected.forcedETH, "accepted or forced ETH left custody");
        assertEq(voting.totalPaid(address(0)), 0, "empty slot acquired a score");
        assertEq(voting.totalPaid(address(handler)), 0, "donor received voting credit");
    }

    function invariant_LeaderboardMatchesGlobalRankAndTieOrder() public view {
        PaidVotingHandler.Model memory expected = handler.model();
        address[3] memory expectedPayers;
        uint256[3] memory expectedAmounts;

        // Count competitors ahead of each actor across the whole ledger. This
        // oracle does not reproduce the application's three-slot insertion loop.
        for (uint256 i; i < expected.actors.length; ++i) {
            if (expected.paid[i] == 0) continue;
            uint256 rank;
            for (uint256 j; j < expected.actors.length; ++j) {
                if (
                    expected.paid[j] > expected.paid[i]
                        || (expected.paid[j] == expected.paid[i] && expected.reachedAt[j] < expected.reachedAt[i])
                ) ++rank;
            }
            if (rank < 3) {
                expectedPayers[rank] = expected.actors[i];
                expectedAmounts[rank] = expected.paid[i];
            }
        }

        (address[3] memory actualPayers, uint256[3] memory actualAmounts) = voting.getTopPayers();
        for (uint256 rank; rank < 3; ++rank) {
            assertEq(actualPayers[rank], expectedPayers[rank], "wrong payer, tie order, or empty slot");
            assertEq(voting.topPayers(rank), expectedPayers[rank], "indexed leaderboard differs from model");
            assertEq(actualAmounts[rank], expectedAmounts[rank], "leaderboard amount differs from ledger");
        }
    }

    /// @dev A fixed sequence checks handler wiring, including eviction and re-entry.
    function test_HandlerExercisesTiesRevertsAndDonations() public {
        handler.paySmall(0, 30);
        handler.paySmall(1, 20);
        handler.paySmall(2, 10);
        handler.paySmall(3, 31);
        handler.chaseScore(2, 1, false);
        invariant_LeaderboardMatchesGlobalRankAndTieOrder();
        handler.chaseScore(2, 1, true);
        handler.rejectZeroVote(2);
        for (uint256 kind; kind < 4; ++kind) {
            handler.rejectPayment(3, kind, 1);
        }
        handler.forceETH(17);
        handler.payLarge(7, type(uint128).max);
        invariant_AccountingAndCustodyMatchAllSuccessfulPayments();
        invariant_LeaderboardMatchesGlobalRankAndTieOrder();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PaidVoting} from "../src/PaidVoting.sol";

/// @dev A contract wallet can vote without implementing a payable receiver.
contract VotingWallet {
    function pay(PaidVoting target) external payable {
        target.vote{value: msg.value}();
    }
}

contract PaidVotingTest is Test {
    PaidVoting private voting;

    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant CAROL = address(0xCA401);
    address private constant DAVE = address(0xDA7E);
    address private constant ERIN = address(0xE41A);

    event VotePaid(address indexed payer, uint256 amount, uint256 cumulativePaid);

    function setUp() public {
        voting = new PaidVoting();
    }

    function test_InitialStateIsEmpty() public view {
        _assertRanking(address(0), address(0), address(0));
        assertEq(voting.totalPaid(ALICE), 0);
        assertEq(voting.totalReceived(), 0);
        assertEq(voting.totalVotes(), 0);
        assertEq(address(voting).balance, 0);
    }

    function test_OneWeiVoteEmitsPaymentAndUpdatesAccounting() public {
        vm.expectEmit(true, false, false, true, address(voting));
        emit VotePaid(ALICE, 1, 1);
        _vote(ALICE, 1);

        _assertRanking(ALICE, address(0), address(0));
        assertEq(voting.totalPaid(ALICE), 1);
        assertEq(voting.totalReceived(), 1);
        assertEq(voting.totalVotes(), 1);
        assertEq(address(voting).balance, 1);
    }

    function test_RepeatPaymentsAccumulateAndEmitNewCumulativeAmount() public {
        _vote(ALICE, 3 ether);
        _vote(BOB, 5 ether);

        vm.expectEmit(true, false, false, true, address(voting));
        emit VotePaid(ALICE, 4 ether, 7 ether);
        _vote(ALICE, 4 ether);

        _assertRanking(ALICE, BOB, address(0));
        assertEq(voting.totalPaid(ALICE), 7 ether);
        assertEq(voting.totalPaid(BOB), 5 ether);
        assertEq(voting.totalReceived(), 12 ether);
        assertEq(voting.totalVotes(), 3);
        assertEq(address(voting).balance, 12 ether);
    }

    function test_ZeroPaymentRevertsOnEmptyState() public {
        vm.expectRevert(PaidVoting.ZeroPayment.selector);
        vm.prank(ALICE);
        voting.vote();

        _assertRanking(address(0), address(0), address(0));
        assertEq(voting.totalPaid(ALICE), 0);
        assertEq(voting.totalReceived(), 0);
        assertEq(voting.totalVotes(), 0);
    }

    function test_ZeroPaymentPreservesExistingState() public {
        _seedThree();
        vm.expectRevert(PaidVoting.ZeroPayment.selector);
        vm.prank(BOB);
        voting.vote();

        _assertSeedState();
    }

    function test_NewPayerCanEnterFirstPlace() public {
        _seedThree();
        _vote(DAVE, 31);
        _assertRanking(DAVE, ALICE, BOB);
        assertEq(voting.totalPaid(CAROL), 10, "eviction must retain lifetime payments");
    }

    function test_NewPayerCanEnterSecondPlace() public {
        _seedThree();
        _vote(DAVE, 25);
        _assertRanking(ALICE, DAVE, BOB);
    }

    function test_NewPayerCanEnterThirdPlace() public {
        _seedThree();
        _vote(DAVE, 15);
        _assertRanking(ALICE, BOB, DAVE);
    }

    function test_PayerBelowThirdStillHasPaymentsCounted() public {
        _seedThree();
        _vote(DAVE, 9);
        _assertRanking(ALICE, BOB, CAROL);
        assertEq(voting.totalPaid(DAVE), 9);
        assertEq(voting.totalReceived(), 69);
        assertEq(voting.totalVotes(), 4);
        assertEq(address(voting).balance, 69);
    }

    function test_LeaderCanIncreaseWithoutDuplicatingItsEntry() public {
        _seedThree();
        _vote(ALICE, 7);
        _assertRanking(ALICE, BOB, CAROL);
        assertEq(voting.totalPaid(ALICE), 37);
    }

    function test_SecondPlaceCanMoveToFirst() public {
        _seedThree();
        _vote(BOB, 11);
        _assertRanking(BOB, ALICE, CAROL);
    }

    function test_ThirdPlaceCanMoveOneOrTwoPlaces() public {
        _seedThree();
        _vote(CAROL, 15);
        _assertRanking(ALICE, CAROL, BOB);
        _vote(BOB, 16);
        _assertRanking(BOB, ALICE, CAROL);
    }

    function test_EvictedPayerCanReenterUsingLifetimePayments() public {
        _seedThree();
        _vote(DAVE, 40);
        _assertRanking(DAVE, ALICE, BOB);
        _vote(CAROL, 25);
        _assertRanking(DAVE, CAROL, ALICE);
        assertEq(voting.totalPaid(CAROL), 35);
        _vote(BOB, 25);
        _assertRanking(BOB, DAVE, CAROL);
        assertEq(voting.totalPaid(BOB), 45);
        assertEq(voting.totalReceived(), 150);
        assertEq(voting.totalVotes(), 6);
    }

    function test_EqualPaymentsKeepEarlierPayersAheadAndExcludeFourth() public {
        _vote(ALICE, 10);
        _vote(BOB, 10);
        _vote(CAROL, 10);
        _vote(DAVE, 10);
        _assertRanking(ALICE, BOB, CAROL);
        assertEq(voting.totalPaid(DAVE), 10);
    }

    function test_TiesUseTimeCurrentTotalWasReachedRatherThanFirstVote() public {
        _vote(ALICE, 1);
        _vote(BOB, 10);
        _vote(ALICE, 9);
        _assertRanking(BOB, ALICE, address(0));

        _vote(CAROL, 10);
        _vote(ALICE, 5);
        _vote(BOB, 5);
        _assertRanking(ALICE, BOB, CAROL);
        _vote(CAROL, 5);
        _vote(DAVE, 15);
        _assertRanking(ALICE, BOB, CAROL);
    }

    function test_TieAtThirdDoesNotAllowAnEvictedPayerToDisplaceIncumbent() public {
        _seedThree();
        _vote(DAVE, 40);
        _vote(CAROL, 10);
        _assertRanking(DAVE, ALICE, BOB);
        _vote(CAROL, 1);
        _assertRanking(DAVE, ALICE, CAROL);
    }

    function test_DirectETHTransfersRevertAndPreserveState() public {
        _seedThree();
        vm.deal(ERIN, 1 ether);
        vm.prank(ERIN);
        (bool paidSuccess,) = address(voting).call{value: 1 ether}("");
        assertFalse(paidSuccess, "plain ETH transfer must be rejected");
        vm.prank(ERIN);
        (bool emptySuccess,) = address(voting).call("");
        assertFalse(emptySuccess, "empty calldata must be rejected");

        assertEq(ERIN.balance, 1 ether, "reverted payment must stay with sender");
        assertEq(voting.totalPaid(ERIN), 0);
        _assertSeedState();
    }

    function test_UnknownSelectorsRevertWithOrWithoutETH() public {
        _seedThree();
        vm.deal(ERIN, 1 ether);
        vm.prank(ERIN);
        (bool paidSuccess,) = address(voting).call{value: 1 ether}(hex"deadbeef");
        assertFalse(paidSuccess);
        vm.prank(ERIN);
        (bool unpaidSuccess,) = address(voting).call(hex"deadbeef");
        assertFalse(unpaidSuccess);

        assertEq(ERIN.balance, 1 ether);
        assertEq(voting.totalPaid(ERIN), 0);
        _assertSeedState();
    }

    function test_QueriesCannotReceivePayment() public {
        _seedThree();
        vm.deal(ERIN, 1 ether);
        vm.prank(ERIN);
        (bool success,) = address(voting).call{value: 1 ether}(abi.encodeCall(PaidVoting.getTopPayers, ()));
        assertFalse(success);
        assertEq(ERIN.balance, 1 ether);
        _assertSeedState();
    }

    function test_NoWithdrawalPauseOrUpgradeEntryPoints() public {
        _seedThree();
        bytes[4] memory calls = [
            abi.encodeWithSignature("withdraw()"),
            abi.encodeWithSignature("pause()"),
            abi.encodeWithSignature("upgradeTo(address)", ERIN),
            abi.encodeWithSignature("initialize()")
        ];
        for (uint256 i; i < calls.length; ++i) {
            (bool success,) = address(voting).call(calls[i]);
            assertFalse(success);
            vm.prank(ERIN);
            (success,) = address(voting).call(calls[i]);
            assertFalse(success);
        }
        _assertSeedState();
    }

    function test_ContractPayerGetsCreditInsteadOfOriginatingEOA() public {
        VotingWallet wallet = new VotingWallet();
        vm.deal(ALICE, 4 ether);
        vm.expectEmit(true, false, false, true, address(voting));
        emit VotePaid(address(wallet), 4 ether, 4 ether);
        vm.prank(ALICE, ALICE);
        wallet.pay{value: 4 ether}(voting);

        assertEq(voting.totalPaid(address(wallet)), 4 ether);
        assertEq(voting.totalPaid(ALICE), 0);
        assertEq(address(wallet).balance, 0);
        assertEq(voting.totalReceived(), 4 ether);
        assertEq(voting.totalVotes(), 1);
        assertEq(address(voting).balance, 4 ether);
        _assertRanking(address(wallet), address(0), address(0));
    }

    function test_ForcedBalanceDoesNotCreateVotesOrAlterRanking() public {
        _seedThree();
        // Simulate ETH credited without invoking vote, such as a protocol-level transfer.
        vm.deal(address(voting), address(voting).balance + 1 ether);
        _assertRanking(ALICE, BOB, CAROL);
        assertEq(voting.totalReceived(), 60);
        assertEq(voting.totalVotes(), 3);

        _vote(DAVE, 11);
        _assertRanking(ALICE, BOB, DAVE);
        assertEq(voting.totalReceived(), 71);
        assertEq(voting.totalVotes(), 4);
        assertEq(address(voting).balance, 1 ether + 71);
        assertEq(voting.totalPaid(address(voting)), 0);
    }

    function testFuzz_PositivePaymentIsCreditedExactly(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, type(uint96).max);
        _vote(ALICE, amount);
        assertEq(voting.totalPaid(ALICE), amount);
        assertEq(voting.totalReceived(), amount);
        assertEq(voting.totalVotes(), 1);
        assertEq(address(voting).balance, amount);
        _assertRanking(ALICE, address(0), address(0));
    }

    function testFuzz_RandomPaymentSequenceMatchesIndependentRanking(uint256 seed, uint8 rawSteps) public {
        uint256 steps = bound(uint256(rawSteps), 1, 64);
        address[8] memory actors;
        uint256[8] memory totals;
        uint256[8] memory lastPaidAt;
        uint256 successfulVotes;
        for (uint256 i; i < actors.length; ++i) {
            actors[i] = address(uint160(0x1000 + i));
        }
        _assertModel(actors, totals, lastPaidAt, successfulVotes);

        for (uint256 step = 1; step <= steps; ++step) {
            uint256 random = uint256(keccak256(abi.encode(seed, step)));
            uint256 actorIndex = random % actors.length;
            // Small values exercise equal totals, low payments, and zero-value rejection often.
            uint256 amount = (random >> 32) % 13;
            if (amount == 0) {
                vm.expectRevert(PaidVoting.ZeroPayment.selector);
                vm.prank(actors[actorIndex]);
                voting.vote();
            } else {
                _vote(actors[actorIndex], amount);
                totals[actorIndex] += amount;
                lastPaidAt[actorIndex] = step;
                ++successfulVotes;
            }
            _assertModel(actors, totals, lastPaidAt, successfulVotes);
        }
    }

    function _vote(address payer, uint256 amount) private {
        vm.deal(payer, payer.balance + amount);
        vm.prank(payer);
        voting.vote{value: amount}();
    }

    function _seedThree() private {
        _vote(ALICE, 30);
        _vote(BOB, 20);
        _vote(CAROL, 10);
    }

    function _assertSeedState() private view {
        _assertRanking(ALICE, BOB, CAROL);
        assertEq(voting.totalPaid(ALICE), 30);
        assertEq(voting.totalPaid(BOB), 20);
        assertEq(voting.totalPaid(CAROL), 10);
        assertEq(voting.totalReceived(), 60);
        assertEq(voting.totalVotes(), 3);
        assertEq(address(voting).balance, 60);
    }

    function _assertRanking(address first, address second, address third) private view {
        address[3] memory expected = [first, second, third];
        (address[3] memory payers, uint256[3] memory amounts) = voting.getTopPayers();
        for (uint256 i; i < 3; ++i) {
            assertEq(payers[i], expected[i], "unexpected leaderboard payer");
            assertEq(voting.topPayers(i), expected[i], "indexed getter differs");
            assertEq(amounts[i], voting.totalPaid(expected[i]), "leaderboard amount differs");
            if (i > 0) assertGe(amounts[i - 1], amounts[i], "leaderboard must be descending");
            for (uint256 j = i + 1; j < 3; ++j) {
                if (payers[i] != address(0)) assertNotEq(payers[i], payers[j], "duplicate payer");
            }
        }
    }

    /// @dev Sorts the entire payer set independently of the contract's bounded top-three update.
    function _assertModel(
        address[8] memory actors,
        uint256[8] memory totals,
        uint256[8] memory lastPaidAt,
        uint256 successfulVotes
    ) private view {
        uint256[8] memory order;
        uint256 sum;
        for (uint256 i; i < actors.length; ++i) {
            order[i] = i;
            sum += totals[i];
            assertEq(voting.totalPaid(actors[i]), totals[i], "cumulative payment differs from model");
        }

        // Selection sort: descending cumulative payment, then earlier arrival at the current total.
        for (uint256 i; i < order.length; ++i) {
            uint256 best = i;
            for (uint256 j = i + 1; j < order.length; ++j) {
                uint256 candidate = order[j];
                uint256 incumbent = order[best];
                if (
                    totals[candidate] > totals[incumbent]
                        || (totals[candidate] == totals[incumbent] && lastPaidAt[candidate] < lastPaidAt[incumbent])
                ) best = j;
            }
            (order[i], order[best]) = (order[best], order[i]);
        }

        (address[3] memory actualPayers, uint256[3] memory actualAmounts) = voting.getTopPayers();
        for (uint256 rank; rank < 3; ++rank) {
            uint256 actorIndex = order[rank];
            address expected = totals[actorIndex] == 0 ? address(0) : actors[actorIndex];
            assertEq(actualPayers[rank], expected, "top payer differs from model");
            assertEq(voting.topPayers(rank), expected, "indexed top payer differs from model");
            assertEq(actualAmounts[rank], totals[actorIndex], "top payment differs from model");
            for (uint256 next = rank + 1; next < 3; ++next) {
                if (expected != address(0)) assertNotEq(actualPayers[rank], actualPayers[next]);
            }
        }
        assertEq(voting.totalReceived(), sum, "accepted ETH must equal cumulative payments");
        assertEq(voting.totalVotes(), successfulVotes, "only successful payments count as votes");
        assertEq(address(voting).balance, sum, "all accepted ETH must remain in the contract");
    }
}

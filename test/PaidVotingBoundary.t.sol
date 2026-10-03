// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PaidVoting} from "src/PaidVoting.sol";

contract RevertingVoteBatch {
    function voteThenFail(PaidVoting target) external payable {
        target.vote{value: msg.value}();
        target.vote();
    }
}

contract PaidVotingBoundaryTest is Test {
    PaidVoting private voting;

    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant CAROL = address(0xCA401);
    address private constant DAVE = address(0xDA7E);

    function setUp() public {
        voting = new PaidVoting();
    }

    function test_MaximumUint256PaymentIsNotTruncated() public {
        _vote(voting, ALICE, type(uint256).max);

        assertEq(voting.totalPaid(ALICE), type(uint256).max);
        assertEq(voting.totalReceived(), type(uint256).max);
        assertEq(voting.totalVotes(), 1);
        assertEq(address(voting).balance, type(uint256).max);
        assertEq(ALICE.balance, 0);
        (address[3] memory payers, uint256[3] memory amounts) = voting.getTopPayers();
        assertEq(payers[0], ALICE);
        assertEq(amounts[0], type(uint256).max);
        for (uint256 i = 1; i < 3; ++i) {
            assertEq(payers[i], address(0));
            assertEq(amounts[i], 0);
        }
    }

    function test_SplitPaymentsCanReachMaximumTotalReceivedExactly() public {
        _assertSplitMatchesLump(type(uint256).max - 6, type(uint256).max - 7);
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_PaymentSplittingPreservesCumulativeRanking(uint256 rawTotal, uint256 rawFirst) public {
        uint256 total = bound(rawTotal, 4, type(uint256).max - 6);
        uint256 first = bound(rawFirst, 1, total - 1);
        _assertSplitMatchesLump(total, first);
    }

    function test_PublicGetterIndexBounds() public {
        _seed();
        assertEq(voting.topPayers(0), ALICE);
        assertEq(voting.topPayers(2), CAROL);

        (bool firstInvalid,) = address(voting).staticcall(abi.encodeWithSignature("topPayers(uint256)", 3));
        (bool largestInvalid,) =
            address(voting).staticcall(abi.encodeWithSignature("topPayers(uint256)", type(uint256).max));
        assertFalse(firstInvalid, "index three is outside the leaderboard");
        assertFalse(largestInvalid, "index must not truncate to an allowed slot");
        _assertSeedState();
    }

    function test_AllGeneratedGettersRejectEtherWithoutChangingState() public {
        _seed();
        bytes[4] memory calls = [
            abi.encodeWithSignature("totalPaid(address)", ALICE),
            abi.encodeWithSignature("totalReceived()"),
            abi.encodeWithSignature("totalVotes()"),
            abi.encodeWithSignature("topPayers(uint256)", 0)
        ];
        vm.deal(DAVE, 1);
        for (uint256 i; i < calls.length; ++i) {
            vm.prank(DAVE);
            (bool success,) = address(voting).call{value: 1}(calls[i]);
            assertFalse(success, "a public getter must reject payment");
            assertEq(DAVE.balance, 1, "rejected payment must remain with its sender");
            _assertSeedState();
        }
    }

    function test_GettersRejectEveryTruncatedArgumentLength() public {
        _seed();
        bytes4[2] memory selectors = [bytes4(keccak256("totalPaid(address)")), bytes4(keccak256("topPayers(uint256)"))];
        for (uint256 i; i < selectors.length; ++i) {
            for (uint256 length; length < 32; ++length) {
                bytes memory payload = abi.encodePacked(selectors[i], new bytes(length));
                (bool success,) = address(voting).staticcall(payload);
                assertFalse(success, "truncated arguments must not be zero padded into a valid query");
            }
        }
        _assertSeedState();
    }

    function test_FailedBatchRollsBackEarlierPaidVote() public {
        _seed();
        RevertingVoteBatch batch = new RevertingVoteBatch();
        vm.deal(DAVE, 100);

        vm.expectRevert(PaidVoting.ZeroPayment.selector);
        vm.prank(DAVE);
        batch.voteThenFail{value: 100}(voting);

        _assertSeedState();
        assertEq(voting.totalPaid(address(batch)), 0, "reverted batch must not earn voting credit");
        assertEq(address(batch).balance, 0);
        assertEq(DAVE.balance, 100, "all ETH from the reverted batch must return to its caller");
    }

    function _assertSplitMatchesLump(uint256 total, uint256 first) private {
        PaidVoting lump = new PaidVoting();
        _vote(lump, ALICE, total);
        _vote(lump, BOB, 3);
        _vote(lump, CAROL, 2);
        _vote(lump, DAVE, 1);

        _vote(voting, ALICE, first);
        _vote(voting, BOB, 3);
        _vote(voting, CAROL, 2);
        _vote(voting, DAVE, 1);
        _vote(voting, ALICE, total - first);

        // Final scores are distinct: splitting changes call count, but no tie-breaking history.
        address[4] memory actors = [ALICE, BOB, CAROL, DAVE];
        uint256[4] memory expectedAmounts = [total, uint256(3), uint256(2), uint256(1)];
        (address[3] memory splitPayers, uint256[3] memory splitAmounts) = voting.getTopPayers();
        (address[3] memory lumpPayers, uint256[3] memory lumpAmounts) = lump.getTopPayers();
        for (uint256 i; i < actors.length; ++i) {
            assertEq(voting.totalPaid(actors[i]), expectedAmounts[i]);
            assertEq(lump.totalPaid(actors[i]), expectedAmounts[i]);
            if (i < 3) {
                assertEq(splitPayers[i], actors[i]);
                assertEq(lumpPayers[i], splitPayers[i]);
                assertEq(splitAmounts[i], expectedAmounts[i]);
                assertEq(lumpAmounts[i], splitAmounts[i]);
            }
        }
        assertEq(voting.totalReceived(), total + 6);
        assertEq(lump.totalReceived(), voting.totalReceived());
        assertEq(address(voting).balance, total + 6);
        assertEq(address(lump).balance, address(voting).balance);
        assertEq(voting.totalVotes(), 5);
        assertEq(lump.totalVotes(), 4);
    }

    function _seed() private {
        _vote(voting, ALICE, 7);
        _vote(voting, BOB, 5);
        _vote(voting, CAROL, 3);
    }

    function _assertSeedState() private view {
        assertEq(voting.totalPaid(ALICE), 7);
        assertEq(voting.totalPaid(BOB), 5);
        assertEq(voting.totalPaid(CAROL), 3);
        assertEq(voting.totalPaid(DAVE), 0);
        assertEq(voting.totalReceived(), 15);
        assertEq(voting.totalVotes(), 3);
        assertEq(address(voting).balance, 15);
        assertEq(voting.topPayers(0), ALICE);
        assertEq(voting.topPayers(1), BOB);
        assertEq(voting.topPayers(2), CAROL);
    }

    function _vote(PaidVoting target, address payer, uint256 amount) private {
        vm.deal(payer, amount);
        vm.prank(payer);
        target.vote{value: amount}();
    }
}

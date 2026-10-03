// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title PaidVoting
/// @notice Pay native ETH to vote and rank among the three highest cumulative payers.
/// @dev Anyone may vote. There are no privileged roles or external calls.
///      All payments are permanent: no withdrawals, refunds, or payouts exist.
contract PaidVoting {
    error ZeroPayment();

    /// @notice Emitted once for each successful paid vote; all amounts are in wei.
    event VotePaid(address indexed payer, uint256 amount, uint256 cumulativePaid);

    /// @notice Cumulative successful payments, including payers outside the top three.
    mapping(address payer => uint256 amount) public totalPaid;

    /// @notice Sum of successful vote payments; excludes ETH forcibly sent to this address.
    uint256 public totalReceived;

    /// @notice Number of successful calls to vote(), regardless of their payment size.
    uint256 public totalVotes;

    /// @notice Highest cumulative payers in descending order; unfilled slots are address(0).
    /// @dev Equal totals favor the payer who first reached that total. Indices are 0 through 2.
    address[3] public topPayers;

    /// @notice There are no deployment parameters, initialization calls, or deployment payments.
    constructor() {}

    /// @notice Cast one vote credited to msg.sender by paying at least one wei.
    /// @dev Rankings use cumulative ETH paid, not the number of calls. Only three slots are scanned.
    function vote() external payable {
        if (msg.value == 0) revert ZeroPayment();

        uint256 cumulativePaid = totalPaid[msg.sender] + msg.value;
        totalPaid[msg.sender] = cumulativePaid;
        totalReceived += msg.value;
        totalVotes += 1;

        _updateTopPayers(msg.sender, cumulativePaid);

        emit VotePaid(msg.sender, msg.value, cumulativePaid);
    }

    /// @notice Return the ordered top three payers and their cumulative payments in wei.
    /// @dev Empty slots have a zero address and a zero amount.
    function getTopPayers() external view returns (address[3] memory payers, uint256[3] memory amounts) {
        payers = topPayers;
        for (uint256 i; i < 3; ++i) {
            amounts[i] = totalPaid[payers[i]];
        }
    }

    function _updateTopPayers(address payer, uint256 cumulativePaid) private {
        uint256 position = 3;
        for (uint256 i; i < 3; ++i) {
            if (topPayers[i] == payer) {
                position = i;
                break;
            }
        }

        if (position == 3) {
            // A newcomer must strictly beat the last slot; ties preserve the earlier payer.
            if (cumulativePaid <= totalPaid[topPayers[2]]) return;
            position = 2;
        }

        // A payer's score only increases, so an existing entry can only move upward.
        // Shift displaced entries downward, overwriting the old slot to prevent duplicates.
        while (position > 0 && cumulativePaid > totalPaid[topPayers[position - 1]]) {
            topPayers[position] = topPayers[position - 1];
            --position;
        }
        topPayers[position] = payer;
    }
}

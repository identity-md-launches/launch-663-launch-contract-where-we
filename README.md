# PaidVoting

An immutable application that accepts paid votes and keeps the three addresses
with the highest cumulative payments. **All paid ETH stays in the contract
permanently. There are no withdrawals, refunds, rewards, or payouts.**

## Assumptions and behavior

- “Who can call what: no one” means **no privileged roles**. Anyone, including
  another contract, may call `vote()`. Prohibiting all callers would prevent the
  requested paid voting. The deployer and factory receive no special powers.
- A vote is a successful `vote()` call with at least one wei of native ETH. No
  price, candidate, proposal, round, deadline, or governance action was specified.
  Each call counts as one vote and credits the complete payment to `msg.sender`.
- Rank depends on total ETH paid by an address across all its votes, not the
  number of votes or its single largest payment. Totals of evicted payers remain
  recorded, so a later payment can return them to the leaderboard.
- The three unique addresses are ordered by cumulative payment, highest first.
  Equal totals favor whoever reached that total first in transaction execution
  order. A newcomer tying third place does not replace the incumbent. Matching a
  higher payer does not pass them. The time of an address's first vote is irrelevant.
- Empty slots contain `address(0)` and an amount of zero. A single address cannot
  occupy multiple places, but a person can control multiple addresses. Rank has
  no identity guarantees and may change before a pending vote is included.
- Zero-value votes revert with `ZeroPayment()`. Ordinary ETH transfers with
  empty calldata and unknown function selectors revert. Payments must use
  `vote()`. The EVM can force ETH into an address without calling its functions;
  such ETH does not count as a vote or change anyone's score.
- There is no owner, pause, upgrade, reset, sweep, external call, token support,
  oracle, or keeper. Accidentally sent tokens are also unrecoverable.

For example, if Alice pays 2 ETH, Bob pays 3 ETH, and Alice pays another 1 ETH,
both total 3 ETH and Bob remains ahead: he reached 3 ETH first. Another payment
of 1 wei from Alice puts her first.

## Interface

Application source: `src/PaidVoting.sol`.

| Function | Meaning |
| --- | --- |
| `vote()` payable | Pay at least 1 wei; permanently record one vote for the caller. |
| `totalPaid(address)` | That address's cumulative recorded payments, in wei. |
| `totalReceived()` | Sum of all successful vote payments, in wei. |
| `totalVotes()` | Number of successful paid-vote calls. |
| `topPayers(uint256)` | Address at index 0, 1, or 2; indices outside that range revert. |
| `getTopPayers()` | Fixed arrays of three addresses and their corresponding amounts in wei. |

Every successful vote emits
`VotePaid(address indexed payer, uint256 amount, uint256 cumulativePaid)`.
Applications can query the leaderboard directly and use events to display vote
history. All getters are public. Only `vote()` mutates application state.

`totalReceived` equals the sum of `totalPaid` over all payers. The contract's ETH
balance equals this sum plus any forced ETH; it is never used to calculate ranks.
Leaderboard work is bounded by three entries regardless of the number of payers.
Arithmetic uses Solidity's checked `uint256` operations.

## Build and tests

The project pins **Solidity 0.8.26**, targets **Cancun**, uses the optimizer with
200 runs, and sets `bytecode_hash = "none"`. Foundry and that compiler must be
installed by the execution environment. The full forge-std v1.9.7 source and
licenses needed by the tests are vendored under `lib/forge-std`; no network or
package installation is needed during verification. There are no production
dependencies, git submodules, FFI, or filesystem permissions.

```sh
forge build
forge test
forge fmt --check
```

Tests cover positive and zero payments, cumulative scores, insertion at each
rank, ties, repeated payers, eviction and re-entry, contract callers, rejected
transfers and selectors, forced ETH, events, and value conservation. A bounded
random-sequence test compares every step to a full-ranking reference model.
Deployment tests exercise a local CREATE2 factory, zero constructor arguments,
nonpayable construction, runtime size, forbidden opcodes, and absence of external
call opcodes. Tests use no environment variables, RPC endpoints, wallets, or
broadcasts and are independent of test order.

## Deployment and operation

`launch.json` describes one application: **PaidVoting**, with **no constructor
arguments**, **zero deployment ETH**, and **no post-deployment initialization**.
The target must support the Cancun EVM. The project's deployment service supplies
the factory, chain, salt, transaction funding, and confirmed application address.
The constructor does not depend on `msg.sender`, so a factory gains no control.
No owner address or outside-contract address needs configuration.

This deliverable prepares the application for that factory; it does not send a
deployment transaction, hold wallet keys, or claim a live contract address.
The deployer is responsible for reviewing the retained-payment policy, confirming
the chain and compiled artifact, simulating deployment, publishing the confirmed
address, and verifying source on the relevant explorer. A UI must clearly disclose
that payments cannot be recovered and must call `vote()` with explicit value.
Users pay transaction gas separately; failed calls do not record payments.

There are no recurring administrative or keeper duties. A logic change requires
deploying a separate application; this contract has no migration or recovery
function. An independent contributor should complete adversarial review before
release with real funds. Local build, tests, fuzzing, and an additional code
review are not a security audit; Slither and Mythril were not run.

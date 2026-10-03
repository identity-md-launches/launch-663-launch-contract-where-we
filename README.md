# PaidVoting / paid.vote

Minimal ASCII-style voting website for the existing **PaidVoting** contract on **Sepolia (11155111)**, at `0x171985d413bcea96306a6fb55055d103a6a91cfa`.

Connect a browser wallet, enter Sepolia ETH, vote and see the top three cumulative payers. **All paid ETH stays in the contract permanently. There are no refunds, rewards or payouts; gas is additional.** Wallet connection exposes an account; there is no backend login, account database or signature-based authentication.

## Install and rebuild

Requirements: Node.js 22.12+ (checked with 22.22.1), npm, Python 3.10+ and Bash. All frontend source, its new manifest and lockfile are in `web/`. Existing Solidity configuration and dependencies are unchanged.

```sh
bash web/scripts/build.sh
```

This installs the locked dependencies with `npm ci` into a temporary directory outside the repository, runs TypeScript checking and the 10 codec/amount tests, builds with Vite, replaces root `dist/`, and checks its relative asset links. Dependencies and caches are removed on exit. No ignore-file changes or repository `node_modules` are needed. Network access is needed to install packages; the finished export already contains all frontend runtime assets.

For a retained development installation, copy `web/` to a temporary work directory, run `npm ci` there, then `npm run dev`. Its ordinary commands are `npm run typecheck`, `node --test tests/codec.test.mjs`, `npm run build`, and `npm run preview`. Vite writes the export to the staging directory’s sibling `dist/`; copy the complete result to this repository’s root `dist/` when publishing a change.

## Preview and publish

To preview the included production export without installing Node packages:

```sh
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173`, then stop the server with Ctrl+C. Use a normal HTTP server rather than opening the HTML as a `file:` URL.

Publish **all contents of root `dist/` together** to any HTTPS static host, gateway subpath or ENS/IPFS site. `dist/index.html`, hashed JS/CSS, favicon and third-party notices are delivery files alongside the source and `web/package-lock.json`. The publisher serves this export and does not need to rebuild. Vite uses `base: './'`; there are no server routes, private credentials or remote font dependencies. No deployment or publishing action was performed by this assignment.

## Wallet and contract behavior

- Supports injected EIP-1193 wallets and EIP-6963 discovery; multiple discovered wallets get a native selector. Mobile users need a wallet’s built-in browser or an injected provider. No WalletConnect relay is configured.
- Connection and chain switching require a separate subsequent vote action. The user approves the transaction in their wallet. Disconnect clears local UI state; revoke site permissions in the wallet if needed.
- Reads use the three pinned public RPCs with fallback and 30-second visible-page refresh. Leaderboard and totals are read at the same block. RPC failure marks existing data outdated and disables voting until refresh succeeds.
- Both public reads and pre-transaction wallet checks compare deployed runtime bytecode. Votes use the pinned recipient, explicit Sepolia chain ID, ABI-derived `vote()` selector and exact bigint value, after simulation and a balance/gas check.
- A pending hash persists in the tab’s session storage. Confirmed receipts refresh the board; reverted receipts show an error. For a dropped/replaced transaction, “Stop tracking” requires a warning confirmation and retains its explorer link. Stopping tracking does not cancel a transaction.
- No live transaction was broadcast during validation. Real extension popups, hardware wallets and physical mobile devices were not exercised.

`web/src/contract.json` contains the derived ABI and pinned deployment/network facts so the site remains rebuildable after assignment inputs are removed. `web/CONTRACT_VERIFICATION.md` records the exact ABI hash, source commit, deployed-code checks and live observations. The small codec deliberately supports only the static ABI types this UI uses.

## Validation performed

- Production Vite build and TypeScript `tsc --noEmit`: passed.
- Codec and amount suite: **10/10 passed**, including independent selector values, fixed arrays, uint256 precision, one wei and invalid decimals.
- `python3 web/scripts/check-export.py`: passed; five self-contained export files, 230,048 bytes, relative local resources, no archives or maps.
- `python3 web/scripts/verify-contract.py`: passed source/ABI/bytecode verification and two live RPC state checks. One other RPC timed out on a state call; fallback remained usable.
- Assigned Chromium browser: actual production bytes loaded under `/preview/`; desktop/mobile screenshots reviewed; widths from 320 to 1280px showed no horizontal overflow. Live reads and mocked wallet connection, switching, voting, rejection, confirmation, revert, pending recovery, account races and RPC failure/retry were exercised. Mock tests broadcast nothing.
- Pinned Better Interface guide applied during construction; all six domains reviewed and applicable findings fixed. Full evidence, source locations and unperformed checks are in `VALIDATION.md`; implemented tokens/components are in `DESIGN.md`.

Browser fixture setup is reproducible with `python3 web/scripts/prepare-browser.py` (requires Foundry `cast`). In the assigned browser’s `browser_run_code_unsafe` tool, run `test/scratch/browser/serve-export.js`, then `test/scratch/browser/mock-setup.js`, then `web/tests/check-primary.js` and `web/tests/check-recovery.js`. The harness fulfills relative static requests with unmodified export bytes and mocks only RPC/wallet behavior. It is not part of the production site. A fresh browser session is required to return to real RPC reads. Native screen-reader sessions, browser-native zoom, non-Chromium browsers and real-wallet signing remain unperformed; these checks are worker observations, not independent certification.

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

The contract is now live on Sepolia at the verified address listed above. This
website assignment did not deploy or change it. The frontend holds no wallet
keys and verifies the chain and exact runtime before requesting a vote. A UI must clearly disclose
that payments cannot be recovered and must call `vote()` with explicit value.
Users pay transaction gas separately; failed calls do not record payments.

There are no recurring administrative or keeper duties. A logic change requires
deploying a separate application; this contract has no migration or recovery
function. An independent contributor should complete adversarial review before
release with real funds. Local build, tests, fuzzing, and an additional code
review are not a security audit; Slither and Mythril were not run.

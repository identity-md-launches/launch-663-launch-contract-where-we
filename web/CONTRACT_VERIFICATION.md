# Contract verification

Checked 2026-10-03 at 05:21 UTC using read-only RPC calls. No transaction was sent and no contract was deployed or changed.

## Pinned inputs and compilation

- Contract: `PaidVoting`, Sepolia, chain ID `11155111` (`0xaa36a7`).
- Address: `0x171985d413bcea96306a6fb55055d103a6a91cfa`.
- Source commit: `3ec109730bda79468a5997e09fce0f6e2ce0e6b7`.
- `src/PaidVoting.sol` was byte-for-byte identical to `git show <sourceCommit>:src/PaidVoting.sol`. SHA-256: `1c128c00256a13a00828fb3976397f112448adf9fb9a2dcebc7d0e9623b04b62`.
- Used existing Foundry settings: Solidity `0.8.26`, Cancun, optimizer enabled with 200 runs, bytecode hash `none`. No existing configuration, dependency, source contract or Git metadata was modified.
- Tools: `forge` and `cast` version `1.8.3`, commit `cae51ad458f6abb64852b7709eb784352429825d`.

`forge inspect PaidVoting abi --json` produced the ABI bundled in `web/src/contract.json`. Canonicalization recursively sorts object keys, preserves array order, emits compact JSON without whitespace, and hashes its UTF-8 bytes using Keccak-256. The following checks passed:

| Artifact | Keccak-256 | Result |
| --- | --- | --- |
| Canonical ABI | `0x1e4af9122817416e59d3066c97cfa6de50ff36d6fb3b090c913e10036a12646e` | Exact match to pinned `abiHash` |
| Creation bytecode | `0x3da6e6566dbb287e335d93d06107a04d19f36a9254c10013a6faba100f99cc30` | Exact match to pinned `creationCodeHash` |
| Runtime bytecode | `0xd3d6146d41c4cf29285078313a3f0b10fc37b86825eede47a90f4e1d7fb4daf9` | Compiled 1,376-byte runtime matched deployed code byte-for-byte |

The bundled contract file retains the ABI, runtime bytecode and hash, deployment references, network endpoints and wallet-add-chain parameters. All nonzero contract addresses and network parameters come from the pinned deployment/network inputs. The runtime hash was derived from the verified compiled bytecode.

## Live evidence

| Pinned RPC | Block | Chain/code | State reads |
| --- | ---: | --- | --- |
| `https://ethereum-sepolia-rpc.publicnode.com` | 11833773 | Correct chain; exact runtime match | Passed |
| `https://rpc.sepolia.ethpandaops.io` | 11833773 | Correct chain; exact runtime match | `getTopPayers` exceeded the 20-second timeout |
| `https://sepolia.rpc.sentio.xyz` | 11833774 | Correct chain; exact runtime match | Passed |

The two successful state checks returned three empty leaderboard slots, `totalVotes = 0`, and `totalReceived = 0` wei. These are historical observations, not values hard-coded into the website.

The pinned [deployment transaction](https://sepolia.etherscan.io/tx/0x48a68b261a16f1e1babed9b4838837d82d3079f53f38e83399ee7e21cd6f10d3) returned a successful receipt (`status = 0x1`) in block `11833739`, matching the manifest. Its receipt has a null `contractAddress` because deployment used a factory; the direct code comparison at the pinned address provides the runtime evidence.

## Reproduce

From the repository root, with Python 3, Foundry and the original Git source commit available:

```sh
python3 web/scripts/verify-contract.py
```

Actual result: exit code `0`; source, bundled ABI, manifest ABI hash, creation bytecode hash, bundled runtime and two complete live RPC checks passed. Compiler artifacts are written only under `test/scratch/contract-verification/`. The script tries all three pinned RPCs, reports each failure, and requires at least one complete successful endpoint. Python syntax compilation also passed; its temporary cache was removed.

The check requires live network access. An RPC may become unavailable or rate-limited after this observation. The website must verify chain and runtime again before requesting a vote. No real wallet authorization, signed transaction, live vote or receipt-confirmed change was exercised by these read-only contract checks; browser interaction validation is recorded separately.

## Contract behavior relevant to the UI

`vote()` requires at least one wei and counts one successful call. The leaderboard ranks cumulative ETH paid, not the number of calls. Ties retain the earlier payer. Every vote payment stays in the contract permanently: there is no withdrawal, refund or payout function. Empty positions are zero addresses. The network uses Sepolia test ETH.

#!/usr/bin/env python3
"""Reproduce pinned-source, ABI, bytecode and read-only Sepolia checks.

Requires Python 3, forge, cast, the original Git source commit and network access.
Writes compiler artifacts only under test/scratch/, which is not submitted.
Never sends a transaction or reads wallet credentials.
"""

from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
CONTRACT = json.loads((ROOT / "web/src/contract.json").read_text())
SCRATCH = ROOT / "test/scratch/contract-verification"
SCRATCH.mkdir(parents=True, exist_ok=True)


def run(*args):
    return subprocess.check_output(
        args, cwd=ROOT, text=True, stderr=subprocess.PIPE, timeout=20
    ).strip()


def keccak(value):
    return run("cast", "keccak", value)


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def inspect(field):
    return run(
        "forge", "inspect", "PaidVoting", field, "--json",
        "--out", str(SCRATCH / "out"),
        "--cache-path", str(SCRATCH / "cache"),
    )


def main():
    # The equality check happens before compiling, so edited source cannot be
    # silently mistaken for the attested source.
    pinned = subprocess.check_output(
        ["git", "show", f"{CONTRACT['sourceCommit']}:src/PaidVoting.sol"], cwd=ROOT
    )
    current = (ROOT / "src/PaidVoting.sol").read_bytes()
    check(current == pinned, "PaidVoting.sol differs from the pinned source commit")

    abi = json.loads(inspect("abi"))
    check(abi == CONTRACT["abi"], "Bundled ABI differs from compiled ABI")
    canonical = json.dumps(abi, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    abi_hash = keccak(canonical)
    check(abi_hash == CONTRACT["abiHash"], "Canonical ABI hash mismatch")

    creation = json.loads(inspect("bytecode"))
    runtime = json.loads(inspect("deployedBytecode"))
    creation_hash = keccak(creation)
    runtime_hash = keccak(runtime)
    check(creation_hash == CONTRACT["creationCodeHash"], "Creation bytecode hash mismatch")
    check(runtime == CONTRACT["runtimeBytecode"], "Bundled runtime bytecode mismatch")
    check(runtime_hash == CONTRACT["runtimeCodeHash"], "Runtime bytecode hash mismatch")

    report = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCommit": CONTRACT["sourceCommit"],
        "sourceSha256": sha256(current).hexdigest(),
        "abiHash": abi_hash,
        "creationCodeHash": creation_hash,
        "runtimeCodeHash": runtime_hash,
        "runtimeBytes": (len(runtime) - 2) // 2,
        "rpcChecks": [],
    }

    for rpc_url in CONTRACT["network"]["rpcUrls"]:
        result = {"rpcUrl": rpc_url}
        try:
            chain_id = int(run("cast", "chain-id", "--rpc-url", rpc_url))
            check(chain_id == CONTRACT["chainId"], "RPC reports unexpected chain")
            block = int(run("cast", "block-number", "--rpc-url", rpc_url))
            deployed = run(
                "cast", "code", CONTRACT["address"], "--block", str(block),
                "--rpc-url", rpc_url,
            )
            check(deployed == runtime, "Deployed code differs from the compiled runtime")
            result.update({"chainId": chain_id, "block": block, "runtimeMatch": True})
            for name, signature in [
                ("topPayers", "getTopPayers()(address[3],uint256[3])"),
                ("totalVotes", "totalVotes()(uint256)"),
                ("totalReceivedWei", "totalReceived()(uint256)"),
            ]:
                result[name] = run(
                    "cast", "call", CONTRACT["address"], signature,
                    "--block", str(block), "--rpc-url", rpc_url,
                )
            result["ok"] = True
        except (subprocess.SubprocessError, ValueError, RuntimeError) as error:
            result["ok"] = False
            result["error"] = str(error)
            if isinstance(error, subprocess.CalledProcessError):
                result["detail"] = error.stderr.strip()[:500]
        report["rpcChecks"].append(result)

    print(json.dumps(report, indent=2))
    check(any(item["ok"] for item in report["rpcChecks"]), "No pinned RPC verified successfully")


if __name__ == "__main__":
    try:
        main()
    except (subprocess.SubprocessError, ValueError, RuntimeError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        sys.exit(1)

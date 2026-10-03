// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PaidVoting} from "../src/PaidVoting.sol";

/// @dev Local factory stand-in: no wallets, environment variables, or broadcasting.
contract PaidVotingFactoryProbe {
    function deploy(bytes32 salt) external returns (PaidVoting) {
        return new PaidVoting{salt: salt}();
    }
}

contract PaidVotingDeploymentTest is Test {
    function test_factoryDeploymentNeedsNoArgumentsOrInitialization() public {
        PaidVotingFactoryProbe factory = new PaidVotingFactoryProbe();
        bytes32 salt = keccak256("paid-voting-test");
        bytes memory initCode = type(PaidVoting).creationCode;
        assertLe(initCode.length, 49_152);

        address predicted = address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(factory), salt, keccak256(initCode)))))
        );
        PaidVoting voting = factory.deploy(salt);
        assertEq(address(voting), predicted);
        assertEq(address(voting).balance, 0);
        assertEq(voting.totalReceived(), 0);
        assertEq(voting.totalVotes(), 0);

        address voter = address(0xCAFE);
        vm.deal(voter, 1 ether);
        vm.prank(voter);
        voting.vote{value: 1 ether}();
        assertEq(voting.topPayers(0), voter);
        assertEq(voting.totalPaid(voter), 1 ether);
        assertEq(voting.totalPaid(address(factory)), 0);
    }

    function test_runtimeMeetsProtectedSizeAndOpcodeConstraints() public {
        PaidVoting voting = new PaidVoting();
        bytes memory code = address(voting).code;
        assertGt(code.length, 0);
        assertLe(code.length, 24_576);

        for (uint256 i; i < code.length; ++i) {
            uint8 opcode = uint8(code[i]);
            // PUSH1 through PUSH32 contain data, which must not be mistaken for opcodes.
            if (opcode >= 0x60 && opcode <= 0x7f) {
                i += opcode - 0x5f;
                continue;
            }
            assertTrue(opcode != 0xf4 && opcode != 0xf2 && opcode != 0xff, "forbidden opcode");
            assertTrue(opcode != 0xf1 && opcode != 0xfa, "unexpected external call");
        }
    }

    function test_constructorRejectsEther() public {
        bytes memory initCode = type(PaidVoting).creationCode;
        vm.deal(address(this), 1 wei);
        address deployed;
        assembly ("memory-safe") {
            deployed := create(1, add(initCode, 32), mload(initCode))
        }
        assertEq(deployed, address(0));
        assertEq(address(this).balance, 1 wei);
    }
}

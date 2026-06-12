// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {FluxToken} from "../src/FluxToken.sol";
import {HoldfastSettlement} from "../src/HoldfastSettlement.sol";

/// @notice Deploys FluxToken + HoldfastSettlement and wires roles.
///         Region genesis and enrollment are separate owner calls once the
///         playtest roster is known (see contracts/README.md).
///
/// Usage (NEVER commit keys — pass via environment):
///   export OPERATOR=0x...              # tick-driver service wallet
///   export RANDOMNESS_PROVIDER=0x...   # testnet: trusted EOA; prod: VRF adapter
///   forge script script/Deploy.s.sol \
///     --rpc-url base_sepolia --broadcast \
///     --private-key "$PRIVATE_KEY"
contract Deploy is Script {
    function run() external {
        address operator = vm.envAddress("OPERATOR");
        address provider = vm.envAddress("RANDOMNESS_PROVIDER");

        vm.startBroadcast();
        FluxToken flux = new FluxToken();
        HoldfastSettlement settlement = new HoldfastSettlement(flux);
        flux.setMinter(address(settlement));
        settlement.setOperator(operator);
        settlement.setRandomnessProvider(provider);
        vm.stopBroadcast();

        console2.log("FluxToken         :", address(flux));
        console2.log("HoldfastSettlement:", address(settlement));
        console2.log("operator          :", operator);
        console2.log("randomnessProvider:", provider);
    }
}

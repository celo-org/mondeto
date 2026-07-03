// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {Mondeto} from "../src/Mondeto.sol";

contract UpgradeScript is Script {
    function run() external {
        string memory broadcastPath =
            string.concat("broadcast/Deploy.s.sol/", vm.toString(block.chainid), "/run-latest.json");
        string memory json = vm.readFile(broadcastPath);
        address proxy = vm.parseJsonAddress(json, ".transactions[1].contractAddress");
        Mondeto current = Mondeto(proxy);

        vm.startBroadcast();

        // Deploy new implementation with same constructor args
        Mondeto newImpl = new Mondeto(current.WIDTH(), current.HEIGHT(), current.HALVING_TIME());
        console.log("New implementation deployed at:", address(newImpl));

        // Upgrade proxy to new implementation
        Mondeto(proxy).upgradeToAndCall(address(newImpl), "");
        console.log("Proxy upgraded:", proxy);

        vm.stopBroadcast();
    }
}

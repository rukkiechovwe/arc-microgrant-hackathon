import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: { evmVersion: "cancun" },
      },
      production: {
        version: "0.8.28",
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },
  networks: {
    // Arc Testnet, chain ID 5042002 - free test USDC from https://faucet.circle.com
    arcTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 5042002,
      url: "https://rpc.testnet.arc.io",
      accounts: [configVariable("ARC_PRIVATE_KEY")],
    },
    // Arc Mainnet, chain ID 5042 (https://docs.arc.io/arc/references/connect-to-arc)
    arcMainnet: {
      type: "http",
      chainType: "l1",
      chainId: 5042,
      url: "https://rpc.mainnet.arc.io",
      // Stored encrypted with `npx hardhat keystore set ARC_PRIVATE_KEY` - never in source.
      accounts: [configVariable("ARC_PRIVATE_KEY")],
    },
  },
});

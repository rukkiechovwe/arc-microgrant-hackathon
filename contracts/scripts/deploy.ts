// Deploy GiftRegistry to Arc Testnet or Mainnet.
//   npx hardhat keystore set ARC_PRIVATE_KEY      (once; stored encrypted)
//   npx hardhat run scripts/deploy.ts --network arcTestnet --build-profile production
//   npx hardhat run scripts/deploy.ts --network arcMainnet --build-profile production
// Without --network it runs against a throwaway local chain with a mock USDC (dry run).
import { mkdirSync, writeFileSync } from "node:fs";
import { network } from "hardhat";
import { erc20Abi, formatUnits } from "viem";

// Canonical USDC ERC-20 interface on Arc (https://docs.arc.io/arc/references/contract-addresses)
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_CHAIN_IDS: Record<string, number> = { arcMainnet: 5042, arcTestnet: 5042002 };
const EXPLORERS: Record<string, string> = { arcMainnet: "https://explorer.arc.io", arcTestnet: "https://explorer.testnet.arc.io" };

const { viem, networkName } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const isLocal = networkName === "default";

const chainId = await publicClient.getChainId();
if (!isLocal && chainId !== ARC_CHAIN_IDS[networkName]) {
  throw new Error(`Expected chain ${ARC_CHAIN_IDS[networkName]} for ${networkName}, connected to ${chainId}`);
}

let usdcAddress: `0x${string}` = ARC_USDC;
if (isLocal) {
  const mock = await viem.deployContract("MockUSDC");
  await mock.write.mint([deployer.account.address, 1_000_000n]);
  usdcAddress = mock.address;
}

const [symbol, decimals, balance] = await Promise.all([
  publicClient.readContract({ address: usdcAddress, abi: erc20Abi, functionName: "symbol" }),
  publicClient.readContract({ address: usdcAddress, abi: erc20Abi, functionName: "decimals" }),
  publicClient.readContract({ address: usdcAddress, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address] }),
]);
if (symbol !== "USDC" || decimals !== 6) throw new Error(`Unexpected token at ${usdcAddress}: ${symbol}/${decimals}`);

console.log(`Network:  ${networkName} (chain ${chainId})`);
console.log(`Deployer: ${deployer.account.address}`);
console.log(`Balance:  ${formatUnits(balance, 6)} USDC (also pays gas on Arc)`);
if (balance === 0n) throw new Error("Deployer has no USDC to pay gas. Fund it first.");

// The deployer is the recovery address: it can only ever recover USDC sent to the contract
// by mistake (balance above totalOwed), never registry funds.
const recoveryAddress = deployer.account.address;
const { contract, deploymentTransaction } = await viem.sendDeploymentTransaction("GiftRegistry", [usdcAddress, recoveryAddress]);
console.log(`Deploy tx: ${deploymentTransaction.hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: deploymentTransaction.hash });
if (receipt.status !== "success") throw new Error("Deployment reverted");

const onchainUsdc = await contract.read.usdc();
console.log(`GiftRegistry: ${contract.address} (block ${receipt.blockNumber}, usdc=${onchainUsdc})`);
console.log(`Recovery address (excess USDC only): ${await contract.read.recoveryAddress()}`);

mkdirSync("deployments", { recursive: true });
writeFileSync(
  `deployments/${networkName}.json`,
  JSON.stringify(
    {
      chainId,
      contract: "GiftRegistry",
      address: contract.address,
      usdc: usdcAddress,
      recoveryAddress,
      deployer: deployer.account.address,
      txHash: deploymentTransaction.hash,
      blockNumber: Number(receipt.blockNumber),
      deployedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
console.log(`Saved deployments/${networkName}.json`);
if (EXPLORERS[networkName]) console.log(`Explorer: ${EXPLORERS[networkName]}/address/${contract.address}`);

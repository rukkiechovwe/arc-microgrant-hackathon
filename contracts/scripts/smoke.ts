// Real end-to-end check against the deployed contract on Arc, using small amounts:
// create a registry, contribute 0.05 USDC to a gift + 0.02 USDC general gift, withdraw.
//   npx hardhat run scripts/smoke.ts --network arcTestnet
//   npx hardhat run scripts/smoke.ts --network arcMainnet
// Costs ~0.07 USDC (returned by the withdrawal) plus a few cents of gas.
// Without --network it runs against a throwaway local chain with a mock USDC (dry run).
import { readFileSync } from "node:fs";
import { network } from "hardhat";
import { erc20Abi, formatUnits, keccak256, maxUint256, parseEventLogs, toHex, type Hash } from "viem";

const { viem, networkName } = await network.create();
const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();

let deployment: { address: `0x${string}`; usdc: `0x${string}` };
if (networkName === "default") {
  const mock = await viem.deployContract("MockUSDC");
  await mock.write.mint([wallet.account.address, 1_000_000n]);
  const r = await viem.deployContract("GiftRegistry", [mock.address, wallet.account.address]);
  deployment = { address: r.address, usdc: mock.address };
} else {
  deployment = JSON.parse(readFileSync(`deployments/${networkName}.json`, "utf8"));
}
const registry = await viem.getContractAt("GiftRegistry", deployment.address);
const usdc = deployment.usdc;
const explorer = networkName === "arcTestnet" ? "https://explorer.testnet.arc.io/tx/" : "https://explorer.arc.io/tx/";

async function confirm(label: string, hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`✔ ${label}: ${explorer}${hash}`);
  return receipt;
}

const balance = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.account.address] });
console.log(`Wallet ${wallet.account.address} holds ${formatUnits(balance, 6)} USDC`);

const createReceipt = await confirm(
  "createRegistry",
  await registry.write.createRegistry([keccak256(toHex(`smoke-test ${Date.now()}`)), [100_000n]]),
);
const [created] = parseEventLogs({ abi: registry.abi, logs: createReceipt.logs, eventName: "RegistryCreated" });
const id = created.args.registryId;
console.log(`  registry id ${id}`);

await confirm("approve 0.07 USDC", await wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: "approve", args: [registry.address, 70_000n] }));
await confirm("contribute 0.05 USDC to gift #0", await registry.write.contribute([id, 0n, 50_000n]));
await confirm("contribute 0.02 USDC general gift", await registry.write.contribute([id, maxUint256, 20_000n]));

let [r, , raised] = await registry.read.getRegistry([id]);
console.log(`  raised: gift0=${formatUnits(raised[0], 6)} general=${formatUnits(r.generalRaised, 6)} total=${formatUnits(r.totalRaised, 6)}`);

await confirm("withdraw", await registry.write.withdraw([id]));
[r] = await registry.read.getRegistry([id]);
console.log(`  totalRaised=${formatUnits(r.totalRaised, 6)} totalWithdrawn=${formatUnits(r.totalWithdrawn, 6)}`);
if (r.totalWithdrawn !== r.totalRaised) throw new Error("Withdrawal accounting mismatch");
console.log("Smoke test passed.");

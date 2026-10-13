// Local development only: deploy a mock USDC + GiftRegistry to `npx hardhat node`
// and give the first 5 test accounts 10,000 mock USDC each.
//   npx hardhat node                                           (terminal 1)
//   npx hardhat run scripts/local-setup.ts --network localhost (terminal 2)
import { network } from "hardhat";

const { viem } = await network.create("localhost");
const wallets = await viem.getWalletClients();
const usdc = await viem.deployContract("MockUSDC");
const registry = await viem.deployContract("GiftRegistry", [usdc.address, wallets[0].account.address]);
for (const w of wallets.slice(0, 5)) await usdc.write.mint([w.account.address, 10_000_000_000n]);

console.log("Add to .env.local in the repo root:\n");
console.log("NEXT_PUBLIC_CHAIN_ID=31337");
console.log(`NEXT_PUBLIC_REGISTRY_ADDRESS=${registry.address}`);
console.log(`NEXT_PUBLIC_USDC_ADDRESS=${usdc.address}`);
console.log("RPC_URL=http://127.0.0.1:8545");

// Read-only check of a deployed GiftRegistry: `node scripts/check-deployment.mjs arcTestnet|arcMainnet`
import { readFileSync } from "node:fs";
import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import { arc, arcTestnet } from "viem/chains";

const name = process.argv[2] ?? "arcMainnet";
const chain = name === "arcMainnet" ? arc : arcTestnet;
const d = JSON.parse(readFileSync(`contracts/deployments/${name}.json`, "utf8"));
const client = createPublicClient({ chain, transport: http() });
const abi = parseAbi(["function usdc() view returns (address)", "function registryCount() view returns (uint256)", "function MIN_AMOUNT() view returns (uint256)"]);

const receipt = await client.getTransactionReceipt({ hash: d.txHash });
const code = await client.getCode({ address: d.address });
const [usdc, count, min] = await Promise.all(["usdc", "registryCount", "MIN_AMOUNT"].map((f) => client.readContract({ address: d.address, abi, functionName: f })));
console.log("chain:", await client.getChainId());
console.log("deploy tx status:", receipt.status, "| block", receipt.blockNumber, "| created:", receipt.contractAddress);
console.log("bytecode at address:", code ? `${(code.length - 2) / 2} bytes` : "NONE");
console.log("usdc():", usdc, "| registryCount():", count, "| MIN_AMOUNT():", formatUnits(min, 6), "USDC");
const extra = parseAbi(["function recoveryAddress() view returns (address)", "function totalOwed() view returns (uint256)", "function excessBalance() view returns (uint256)"]);
try {
  const [rec, owed, excess] = await Promise.all(["recoveryAddress", "totalOwed", "excessBalance"].map((f) => client.readContract({ address: d.address, abi: extra, functionName: f })));
  console.log("recoveryAddress():", rec, "| totalOwed():", formatUnits(owed, 6), "USDC | excessBalance():", formatUnits(excess, 6), "USDC");
} catch {
  console.log("(older contract version: no excess-recovery functions)");
}
console.log("explorer:", `${chain.blockExplorers.default.url}/address/${d.address}`);

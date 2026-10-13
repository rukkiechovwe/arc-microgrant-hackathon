import { defineChain, getAddress, maxUint256, type Address, type Hash } from "viem";
import { arc, arcTestnet } from "viem/chains";

// Arc Mainnet (chain 5042) is the default. Arc Testnet (5042002) uses free faucet USDC.
// Chain 31337 is only for local development against `npx hardhat node` in ./contracts.
export const localChain = defineChain({
  id: 31337,
  name: "Local Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? arc.id);
export const chain = chainId === localChain.id ? localChain : chainId === arcTestnet.id ? arcTestnet : arc;
/** True on Arc Mainnet or Arc Testnet (both use the canonical USDC address and have an explorer). */
export const isArc = chain.id === arc.id || chain.id === arcTestnet.id;
export const isTestnet = chain.id !== arc.id;

/** Canonical USDC ERC-20 interface on Arc Mainnet and Testnet (6 decimals). https://docs.arc.io/arc/references/contract-addresses */
export const ARC_USDC: Address = "0x3600000000000000000000000000000000000000";

export const USDC_ADDRESS: Address = isArc
  ? ARC_USDC
  : getAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS ?? ARC_USDC);

export const REGISTRY_ADDRESS: Address | undefined = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS
  ? getAddress(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS)
  : undefined;

export const USDC_DECIMALS = 6;
/** Smallest contribution / gift target accepted by the contract: 0.01 USDC. */
export const MIN_AMOUNT = 10_000n;
export const MAX_GIFTS = 50;
/** Gift id the contract uses for the general cash fund. */
export const GENERAL_FUND = maxUint256;

const explorer = chain.id === arc.id ? arc.blockExplorers.default.url
  : chain.id === arcTestnet.id ? arcTestnet.blockExplorers.default.url : null;
export const explorerTx = (hash: Hash) => (explorer ? `${explorer}/tx/${hash}` : null);
export const explorerAddress = (address: Address) => (explorer ? `${explorer}/address/${address}` : null);

/**
 * Server-side RPC URL. RPC_URL overrides the chain default, except that a localhost URL is
 * ignored on Arc (a leftover from local testing would otherwise silently break all reads).
 */
export function serverRpcUrl(): string {
  const override = process.env.RPC_URL?.trim();
  if (override && !(isArc && /localhost|127\.0\.0\.1/.test(override))) return override;
  return chain.rpcUrls.default.http[0];
}

export function requireRegistryAddress(): Address {
  if (!REGISTRY_ADDRESS) throw new Error("NEXT_PUBLIC_REGISTRY_ADDRESS is not configured");
  return REGISTRY_ADDRESS;
}

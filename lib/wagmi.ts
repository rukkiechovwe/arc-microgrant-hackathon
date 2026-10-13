import { parseGwei } from "viem";
import { createConfig, fallback, http, injected, type Config } from "wagmi";
import { estimateFeesPerGas } from "wagmi/actions";
import { chain } from "./config";

// In the browser, reads go through our same-origin /api/rpc proxy first, because ad blockers
// often block public RPC hosts (net::ERR_BLOCKED_BY_CLIENT). The public RPC is the fallback.
const transport =
  typeof window === "undefined" ? http() : fallback([http(`${window.location.origin}/api/rpc`), http()]);

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: transport } as Record<typeof chain.id, typeof transport>,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

// Arc's mempool silently drops transactions with maxFeePerGas below 20 gwei
// (https://docs.arc.io/arc/references/gas-and-fees), so never let a wallet go lower.
const ARC_MIN_FEE = parseGwei("20");

export async function arcFees(config: Config) {
  const est = await estimateFeesPerGas(config, { chainId: chain.id });
  const maxPriorityFeePerGas = est.maxPriorityFeePerGas ?? parseGwei("1");
  let maxFeePerGas = est.maxFeePerGas ?? ARC_MIN_FEE;
  if (maxFeePerGas < ARC_MIN_FEE + maxPriorityFeePerGas) maxFeePerGas = ARC_MIN_FEE + maxPriorityFeePerGas;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

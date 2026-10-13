import "server-only";
import { createPublicClient, http, type Hex } from "viem";
import { chain, requireRegistryAddress, serverRpcUrl } from "../config";
import { giftRegistryAbi } from "../giftRegistryAbi";

export const publicClient = createPublicClient({
  chain,
  transport: http(serverRpcUrl()),
});

export type OnchainRegistry = {
  owner: `0x${string}`;
  metadataHash: Hex;
  giftTargets: readonly bigint[];
};

/** Returns null when the registry id doesn't exist onchain. */
export async function readOnchainRegistry(id: bigint): Promise<OnchainRegistry | null> {
  const count = await publicClient.readContract({
    address: requireRegistryAddress(),
    abi: giftRegistryAbi,
    functionName: "registryCount",
  });
  if (id < 1n || id > count) return null;
  const [registry, giftTargets] = await publicClient.readContract({
    address: requireRegistryAddress(),
    abi: giftRegistryAbi,
    functionName: "getRegistry",
    args: [id],
  });
  return { owner: registry.owner, metadataHash: registry.metadataHash, giftTargets };
}

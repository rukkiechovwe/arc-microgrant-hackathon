"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, ContractFunctionReturnType } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { chain, REGISTRY_ADDRESS } from "./config";
import { giftRegistryAbi } from "./giftRegistryAbi";
import { hashMetadata, parseMetadataJson, type RegistryMetadata } from "./metadata";

export type ContributionNote = {
  txHash: `0x${string}`;
  giftId: string;
  contributor: `0x${string}`;
  amount: string;
  name: string;
  message: string;
  blockNumber: number;
};

export type OnchainRegistryData = ContractFunctionReturnType<typeof giftRegistryAbi, "view", "getRegistry">;

/** Live onchain state (amounts, owner) for a registry, read directly from Arc. */
export function useOnchainRegistry(id: bigint | null) {
  return useReadContract({
    address: REGISTRY_ADDRESS,
    abi: giftRegistryAbi,
    functionName: "getRegistry",
    args: [id ?? 0n],
    chainId: chain.id,
    query: { enabled: !!REGISTRY_ADDRESS && id !== null, refetchInterval: 15_000, retry: 1 },
  });
}

export type RegistryDetails = { registryId: bigint; slug: string; json: string; metadata: RegistryMetadata };

/** Offchain details by link slug or numeric id. `null` when not found / not published yet. */
export function useRegistryMetadata(key: string) {
  return useQuery({
    queryKey: ["registry-metadata", key],
    queryFn: async (): Promise<RegistryDetails | null> => {
      const res = await fetch(`/api/registries/${encodeURIComponent(key)}`);
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load registry details");
      const { registryId, slug, metadataJson } = await res.json();
      return { registryId: BigInt(registryId), slug, json: metadataJson, metadata: parseMetadataJson(metadataJson) };
    },
  });
}

export const myRegistriesKey = (address: string | undefined) => ["my-registries", address?.toLowerCase()];

/**
 * Registries the given wallet currently owns (checked onchain by the API), newest first.
 * Details are returned unverified; callers that display them re-check the hash.
 */
export function useRegistriesOwnedBy(address: Address | undefined) {
  return useQuery({
    enabled: !!address && !!REGISTRY_ADDRESS,
    queryKey: myRegistriesKey(address),
    queryFn: async (): Promise<RegistryDetails[]> => {
      const res = await fetch(`/api/registries?owner=${address}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load your registries");
      const { registries } = (await res.json()) as { registries: { registryId: string; slug: string; metadataJson: string }[] };
      return registries.flatMap((r) => {
        try {
          return [{ registryId: BigInt(r.registryId), slug: r.slug, json: r.metadataJson, metadata: parseMetadataJson(r.metadataJson) }];
        } catch {
          return [];
        }
      });
    },
    staleTime: 30_000,
  });
}

/** The connected wallet's registries. `hasRegistry` is false until loaded. */
export function useMyRegistries() {
  const { address, isConnected } = useConnection();
  const query = useRegistriesOwnedBy(isConnected ? address : undefined);
  return { ...query, address: isConnected ? address : undefined, hasRegistry: (query.data?.length ?? 0) > 0 };
}

/** Points the stored owner at the current onchain owner (after an ownership transfer). */
export async function syncRegistryOwner(registryId: bigint) {
  await fetch(`/api/registries/${registryId}/owner`, { method: "POST" }).catch(() => {});
}

export function useContributionNotes(id: bigint | null) {
  return useQuery({
    enabled: id !== null,
    queryKey: ["registry-contributions", String(id)],
    queryFn: async (): Promise<ContributionNote[]> => {
      const res = await fetch(`/api/registries/${id}/contributions`);
      if (!res.ok) throw new Error("Could not load contributions");
      return (await res.json()).contributions;
    },
    refetchInterval: 30_000,
  });
}

export function metadataMatchesChain(json: string, onchainHash: string) {
  return hashMetadata(json) === onchainHash;
}

// Registry details are kept in localStorage between the onchain transaction and the
// database save, so the owner can finish publishing if that save fails.
const pendingKey = (hash: string) => `gift-registry:pending:${hash}`;

export function savePendingMetadata(hash: string, json: string) {
  try {
    localStorage.setItem(pendingKey(hash), json);
  } catch {}
}

export function loadPendingMetadata(hash: string): string | null {
  try {
    return localStorage.getItem(pendingKey(hash));
  } catch {
    return null;
  }
}

export function clearPendingMetadata(hash: string) {
  try {
    localStorage.removeItem(pendingKey(hash));
  } catch {}
}

export async function publishMetadata(registryId: bigint, metadataJson: string) {
  const res = await fetch("/api/registries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ registryId: registryId.toString(), metadataJson }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not save registry details");
}

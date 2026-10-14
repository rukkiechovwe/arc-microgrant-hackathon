import "server-only";
import { chain, requireRegistryAddress } from "../config";

export function registryKey(registryId: bigint) {
  return {
    chain_id: chain.id,
    contract_address: requireRegistryAddress().toLowerCase(),
    registry_id: Number(registryId),
  };
}

export function slugKey(slug: string) {
  return { chain_id: chain.id, contract_address: requireRegistryAddress().toLowerCase(), slug };
}

export function ownerKey(owner: string) {
  return { chain_id: chain.id, contract_address: requireRegistryAddress().toLowerCase(), owner: owner.toLowerCase() };
}

export function parseRegistryId(raw: string): bigint | null {
  if (!/^\d{1,15}$/.test(raw)) return null;
  const id = BigInt(raw);
  return id > 0n ? id : null;
}

export function jsonError(status: number, error: string) {
  return Response.json({ error }, { status });
}

export function serverError(e: unknown) {
  console.error(e);
  return jsonError(500, e instanceof Error ? e.message : "Server error");
}

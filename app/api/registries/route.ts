import { isAddress } from "viem";
import { z } from "zod";
import { hashMetadata, parseMetadataJson } from "@/lib/metadata";
import { readOnchainRegistry } from "@/lib/server/chain";
import { jsonError, ownerKey, registryKey, serverError } from "@/lib/server/api";
import { getStore, SlugTakenError } from "@/lib/server/store";

const bodySchema = z.object({
  registryId: z.string().regex(/^\d{1,15}$/),
  metadataJson: z.string().max(100_000),
});

/**
 * Registries owned by a wallet: `GET /api/registries?owner=0x…`. The stored owner is only an
 * index, so each match is re-checked against the current onchain owner. A row that went stale
 * (ownership moved on) is corrected and left out.
 */
export async function GET(request: Request) {
  try {
    const owner = new URL(request.url).searchParams.get("owner")?.trim() ?? "";
    if (!isAddress(owner)) return jsonError(400, "Invalid owner address");

    const store = getStore();
    const rows = await store.listRegistriesByOwner(ownerKey(owner));
    const checked = await Promise.all(
      rows.map(async (row) => {
        const onchain = await readOnchainRegistry(BigInt(row.registry_id));
        const current = onchain?.owner.toLowerCase();
        if (current && current !== row.owner) await store.setRegistryOwner(registryKey(BigInt(row.registry_id)), current);
        return current === owner.toLowerCase() ? row : null;
      }),
    );

    return Response.json(
      {
        registries: checked
          .filter((r) => r !== null)
          .map((r) => ({
            registryId: String(r.registry_id),
            slug: r.slug,
            metadataJson: r.metadata_json,
            createdAt: r.created_at ?? null,
          })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return serverError(e);
  }
}

/**
 * Publishes a registry's offchain details. No login needed: the details are only accepted
 * if their keccak256 hash equals the `metadataHash` the owner already committed onchain
 * in `createRegistry`, so nobody else can attach different details to the registry. The
 * details also name the owner wallet and the link slug, so a copycat registry that reuses
 * the same hash is rejected (wrong owner) and nobody can claim someone else's link.
 */
export async function POST(request: Request) {
  try {
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return jsonError(400, "Invalid request body");

    let metadata;
    try {
      metadata = parseMetadataJson(body.data.metadataJson);
    } catch {
      return jsonError(400, "Registry details are not valid");
    }

    const registryId = BigInt(body.data.registryId);
    const onchain = await readOnchainRegistry(registryId);
    if (!onchain) return jsonError(404, "Registry not found onchain");

    const hash = hashMetadata(body.data.metadataJson);
    if (hash !== onchain.metadataHash) {
      return jsonError(409, "Details do not match the fingerprint stored onchain for this registry");
    }
    if (metadata.gifts.length !== onchain.giftTargets.length) {
      return jsonError(409, "Gift count does not match the onchain registry");
    }
    if (metadata.owner !== onchain.owner.toLowerCase()) {
      return jsonError(409, "These details belong to a different owner");
    }

    try {
      await getStore().saveRegistry({
        ...registryKey(registryId),
        slug: metadata.slug,
        owner: onchain.owner.toLowerCase(),
        metadata_json: body.data.metadataJson,
        metadata_hash: hash,
      });
    } catch (e) {
      if (e instanceof SlugTakenError) return jsonError(409, e.message);
      throw e;
    }
    return Response.json({ ok: true, registryId: body.data.registryId, slug: metadata.slug });
  } catch (e) {
    return serverError(e);
  }
}

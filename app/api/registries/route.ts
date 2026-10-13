import { z } from "zod";
import { hashMetadata, parseMetadataJson } from "@/lib/metadata";
import { readOnchainRegistry } from "@/lib/server/chain";
import { jsonError, registryKey, serverError } from "@/lib/server/api";
import { getStore, SlugTakenError } from "@/lib/server/store";

const bodySchema = z.object({
  registryId: z.string().regex(/^\d{1,15}$/),
  metadataJson: z.string().max(100_000),
});

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

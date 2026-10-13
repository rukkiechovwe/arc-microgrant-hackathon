import { SLUG_PATTERN } from "@/lib/metadata";
import { jsonError, parseRegistryId, registryKey, serverError, slugKey } from "@/lib/server/api";
import { getStore } from "@/lib/server/store";

/**
 * Offchain details for a registry, looked up by link slug (e.g. "ada-and-tunde-2274681a67cd")
 * or by numeric onchain id. Amounts are read from the chain by the client.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/registries/[id]">) {
  try {
    const key = decodeURIComponent((await ctx.params).id).toLowerCase();
    const store = getStore();
    let row;
    if (SLUG_PATTERN.test(key)) {
      row = await store.getRegistryBySlug(slugKey(key));
    } else {
      const registryId = parseRegistryId(key);
      if (!registryId) return jsonError(400, "Invalid registry link");
      row = await store.getRegistry(registryKey(registryId));
    }
    if (!row) return jsonError(404, "Registry details not published");

    return Response.json(
      {
        registryId: String(row.registry_id),
        slug: row.slug,
        metadataJson: row.metadata_json,
        metadataHash: row.metadata_hash,
        createdAt: row.created_at ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return serverError(e);
  }
}

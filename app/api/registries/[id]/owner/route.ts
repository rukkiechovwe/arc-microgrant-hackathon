import { readOnchainRegistry } from "@/lib/server/chain";
import { jsonError, parseRegistryId, registryKey, serverError } from "@/lib/server/api";
import { getStore } from "@/lib/server/store";

/**
 * Re-syncs the stored owner from the chain, so a registry shows up in the new owner's dashboard
 * after `acceptRegistryOwnership`. No auth needed: the value always comes from Arc, never the caller.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/registries/[id]/owner">) {
  try {
    const registryId = parseRegistryId((await ctx.params).id);
    if (!registryId) return jsonError(400, "Invalid registry id");
    const onchain = await readOnchainRegistry(registryId);
    if (!onchain) return jsonError(404, "Registry not found onchain");
    const owner = onchain.owner.toLowerCase();
    await getStore().setRegistryOwner(registryKey(registryId), owner);
    return Response.json({ ok: true, owner });
  } catch (e) {
    return serverError(e);
  }
}

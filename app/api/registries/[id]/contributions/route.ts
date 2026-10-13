import { isAddressEqual, maxUint256, parseEventLogs, type Log } from "viem";
import { z } from "zod";
import { chain, requireRegistryAddress } from "@/lib/config";
import { giftRegistryAbi } from "@/lib/giftRegistryAbi";
import { jsonError, parseRegistryId, registryKey, serverError } from "@/lib/server/api";
import { publicClient } from "@/lib/server/chain";
import { getStore, type ContributionRow } from "@/lib/server/store";

export async function GET(_request: Request, ctx: RouteContext<"/api/registries/[id]/contributions">) {
  try {
    const registryId = parseRegistryId((await ctx.params).id);
    if (!registryId) return jsonError(400, "Invalid registry id");
    const rows = await getStore().listContributions(registryKey(registryId));
    return Response.json(
      {
        contributions: rows.map((r) => ({
          txHash: r.tx_hash,
          giftId: r.gift_id,
          contributor: r.contributor,
          amount: r.amount,
          name: r.name,
          message: r.message,
          blockNumber: r.block_number,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return serverError(e);
  }
}

const bodySchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  name: z.string().trim().max(60).default(""),
  message: z.string().trim().max(280).default(""),
});

/**
 * Records a contribution (with an optional name and note) for the contributions list.
 * The server reads the transaction receipt from Arc itself: only successful transactions
 * to our contract with a matching `Contributed` event are stored, and the amount, gift and
 * contributor always come from the chain, never from the request.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/registries/[id]/contributions">) {
  try {
    const registryId = parseRegistryId((await ctx.params).id);
    if (!registryId) return jsonError(400, "Invalid registry id");
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return jsonError(400, "Invalid request body");

    const hash = body.data.txHash as `0x${string}`;
    const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (!receipt) return jsonError(404, "Transaction not found or not yet confirmed");
    if (receipt.status !== "success") return jsonError(422, "Transaction failed onchain");

    const contract = requireRegistryAddress();
    const events = parseEventLogs({
      abi: giftRegistryAbi,
      eventName: "Contributed",
      logs: receipt.logs.filter((l: Log) => isAddressEqual(l.address, contract)),
    }).filter((e) => e.args.registryId === registryId);
    if (events.length === 0) return jsonError(422, "No contribution to this registry in that transaction");

    const rows: ContributionRow[] = events.map((e) => ({
      ...registryKey(registryId),
      tx_hash: hash.toLowerCase(),
      log_index: e.logIndex,
      gift_id: e.args.giftId === maxUint256 ? "general" : e.args.giftId.toString(),
      contributor: e.args.contributor.toLowerCase(),
      amount: e.args.amount.toString(),
      block_number: Number(receipt.blockNumber),
      // Name and note are self-reported (unauthenticated); the first submission per tx wins.
      name: body.data.name,
      message: body.data.message,
    }));
    await getStore().insertContributions(rows);
    return Response.json({ ok: true, chainId: chain.id, count: rows.length });
  } catch (e) {
    return serverError(e);
  }
}

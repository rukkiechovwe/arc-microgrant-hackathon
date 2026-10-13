import { serverRpcUrl } from "@/lib/config";

// Same-origin JSON-RPC proxy for the browser's blockchain reads. Ad/privacy blockers often
// block third-party RPC hosts (net::ERR_BLOCKED_BY_CLIENT); requests to our own domain pass.
// Only read-only methods are forwarded - transactions are sent by the user's wallet, which
// uses its own RPC connection.
const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBalance",
  "eth_getCode",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
  "net_version",
]);
const MAX_BATCH = 20;

type RpcRequest = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

const upstream = serverRpcUrl();

function rejection(req: RpcRequest) {
  return { jsonrpc: "2.0", id: req?.id ?? null, error: { code: -32601, message: "Method not allowed" } };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });

  const batch: RpcRequest[] = Array.isArray(body) ? body : [body];
  if (batch.length === 0 || batch.length > MAX_BATCH) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid batch size" } }, { status: 400 });
  }

  const allowed = batch.filter((r) => typeof r?.method === "string" && ALLOWED_METHODS.has(r.method));
  let results: unknown[] = [];
  if (allowed.length > 0) {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Array.isArray(body) ? allowed : allowed[0]),
      cache: "no-store",
    }).catch(() => null);
    if (!res || !res.ok) {
      return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Upstream RPC unavailable" } }, { status: 502 });
    }
    const json = await res.json();
    results = Array.isArray(json) ? json : [json];
  }

  // Preserve the caller's order, slotting rejections for disallowed methods back in.
  const byId = new Map(results.map((r) => [JSON.stringify((r as RpcRequest).id), r]));
  const out = batch.map((r) =>
    typeof r?.method === "string" && ALLOWED_METHODS.has(r.method) ? byId.get(JSON.stringify(r.id)) ?? rejection(r) : rejection(r),
  );
  return Response.json(Array.isArray(body) ? out : out[0]);
}

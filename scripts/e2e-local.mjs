// Local E2E (run from repo root with `npx hardhat node` + local-setup + `npm run dev` running): drives real txs on the Hardhat node and exercises the app's API routes.
import { createPublicClient, createWalletClient, http, keccak256, stringToHex, parseEventLogs, maxUint256, erc20Abi, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const root = process.cwd();
const APP = "http://localhost:3000";
const REG = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
const USDC = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const abiSrc = readFileSync(`${root}/lib/giftRegistryAbi.ts`, "utf8");
const abi = JSON.parse(abiSrc.slice(abiSrc.indexOf("["), abiSrc.lastIndexOf("]") + 1));
const chain = defineChain({ id: 31337, name: "local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } });
const pub = createPublicClient({ chain, transport: http() });
// Well-known Hardhat test keys (accounts #0 and #1) - local only.
const owner = createWalletClient({ chain, transport: http(), account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") });
const guest = createWalletClient({ chain, transport: http(), account: privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") });

let failures = 0;
const check = (label, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${label} ${extra}`); if (!ok) failures++; };
const post = (path, body) => fetch(APP + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const wait = async (h) => pub.waitForTransactionReceipt({ hash: h });

const slug = `ada-and-tundes-wedding-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
const meta = { v: 2, owner: owner.account.address.toLowerCase(), slug, displayName: "Ada & Tunde", title: "Ada & Tunde's Wedding", description: "Thank you!", occasion: "wedding", ngnPerUsdc: 1500,
  gifts: [{ name: "Refrigerator", description: "Double door", imageUrl: "", targetNgn: 1500000 }, { name: "Blender", description: "", imageUrl: "", targetNgn: null }],
  createdAt: new Date().toISOString() };
const json = JSON.stringify(meta);
const hash = keccak256(stringToHex(json));

const r1 = await wait(await owner.writeContract({ address: REG, abi, functionName: "createRegistry", args: [hash, [1_000_000_000n, 50_000_000n]] }));
const id = parseEventLogs({ abi, logs: r1.logs, eventName: "RegistryCreated" })[0].args.registryId;
console.log("registry id", id);

let res = await fetch(`${APP}/api/registries/${id}`);
check("GET metadata before publish -> 404", res.status === 404);
res = await post("/api/registries", { registryId: id.toString(), metadataJson: json.replace("Thank you!", "Send money to me") });
check("POST tampered metadata -> 409", res.status === 409, await res.text());
res = await post("/api/registries", { registryId: "999", metadataJson: json });
check("POST metadata for unknown registry -> 404", res.status === 404);
res = await post("/api/registries", { registryId: id.toString(), metadataJson: json });
check("POST valid metadata -> 200", res.status === 200, await res.text());
res = await post("/api/registries", { registryId: id.toString(), metadataJson: json });
check("POST same metadata again is idempotent -> 200", res.status === 200);
res = await fetch(`${APP}/api/registries/${id}`);
const got = await res.json();
check("GET metadata returns exact JSON", got.metadataJson === json && keccak256(stringToHex(got.metadataJson)) === hash);
const bySlug = await (await fetch(`${APP}/api/registries/${slug}`)).json();
check("GET by slug resolves to the registry id", bySlug.registryId === id.toString() && bySlug.metadataJson === json);

// Copycat: reuses the exact same hash from a different wallet, then posts the victim's details.
const rc = await wait(await guest.writeContract({ address: REG, abi, functionName: "createRegistry", args: [hash, [1_000_000_000n, 50_000_000n]] }));
const copyId = parseEventLogs({ abi, logs: rc.logs, eventName: "RegistryCreated" })[0].args.registryId;
res = await post("/api/registries", { registryId: copyId.toString(), metadataJson: json });
check("copycat registry reusing the hash is rejected (owner mismatch) -> 409", res.status === 409, await res.text());

await wait(await guest.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [REG, 300_000_000n] }));
const c1 = await wait(await guest.writeContract({ address: REG, abi, functionName: "contribute", args: [id, 0n, 250_000_000n] }));
const c2 = await wait(await guest.writeContract({ address: REG, abi, functionName: "contribute", args: [id, maxUint256, 25_500_000n] }));

res = await post(`/api/registries/${id}/contributions`, { txHash: c1.transactionHash, name: "Aunt Bola", message: "Congrats!" });
check("POST note for real contribution -> 200", res.status === 200, await res.text());
res = await post(`/api/registries/${id}/contributions`, { txHash: c2.transactionHash });
check("POST general-gift contribution -> 200", res.status === 200);
res = await post(`/api/registries/${id}/contributions`, { txHash: r1.transactionHash, name: "Fake" });
check("POST non-contribution tx -> 422", res.status === 422, await res.text());
res = await post(`/api/registries/${id}/contributions`, { txHash: "0x" + "ab".repeat(32) });
check("POST unknown tx -> 404", res.status === 404);
res = await post(`/api/registries/${id}/contributions`, { txHash: c1.transactionHash, name: "Impostor" });
check("POST duplicate tx doesn't overwrite", res.status === 200);

const list = (await (await fetch(`${APP}/api/registries/${id}/contributions`)).json()).contributions;
check("contribution list has 2 verified entries", list.length === 2, JSON.stringify(list));
const fridge = list.find((c) => c.giftId === "0");
check("amount/gift/contributor come from chain, name kept from first post",
  fridge?.amount === "250000000" && fridge?.name === "Aunt Bola" && fridge?.contributor === guest.account.address.toLowerCase());
check("general gift recorded", list.some((c) => c.giftId === "general" && c.amount === "25500000"));

const [reg] = await pub.readContract({ address: REG, abi, functionName: "getRegistry", args: [id] });
check("onchain totalRaised = 275.5 USDC", reg.totalRaised === 275_500_000n);
await wait(await owner.writeContract({ address: REG, abi, functionName: "withdraw", args: [id] }));
const [reg2] = await pub.readContract({ address: REG, abi, functionName: "getRegistry", args: [id] });
check("withdraw moved everything", reg2.totalWithdrawn === 275_500_000n);

for (const p of ["/", "/create", `/r/${slug}`, `/r/${id}`, "/r/abc"]) {
  const r = await fetch(APP + p);
  check(`page ${p} renders`, r.status === 200);
}
console.log(failures ? `${failures} FAILURES` : "ALL PASSED");
process.exit(failures ? 1 : 0);
